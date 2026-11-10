// ghaith-minutes: organises a meeting's points into minutes, and proposes its actions as tasks.
// The person writes the title, who attended and the points as they come; Ghaith returns formal minutes (a summary,
// the points grouped by topic, decisions, open questions, the next meeting) and the actions: theirs become tasks,
// other people's become "waiting for" tasks. The minutes are saved on the meeting; the tasks are only proposals,
// added after the person reviews them in the app. Runs as the signed-in user (row-level security applies).
//
// Body: { meeting_id, lang: 'ar' | 'en' }
// Secrets: ANTHROPIC_API_KEY (required), GHAITH_MODEL (optional).
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = Deno.env.get('GHAITH_MODEL') || 'claude-sonnet-5-5';
const DAILY_LIMIT = 200;
const TZ_OFFSET_H = 4; // Asia/Dubai

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => reply(status, { error: code, message });

// ---------- time (Dubai local) ----------
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const local = (d: Date) => new Date(d.getTime() + TZ_OFFSET_H * 3600_000);
const pad = (n: number) => String(n).padStart(2, '0');
function localIso(d: Date): string {
  const l = local(d);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}T${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
}
const weekday = (d: Date) => DAYS[local(d).getUTCDay()];
function calendar(now: Date): string {
  const lines: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() + i * 86400_000);
    lines.push(`${localIso(d).slice(0, 10)} ${weekday(d)}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`);
  }
  return lines.join('\n');
}
function parseWhen(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T09:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += '+04:00';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const CATS = ['work', 'meeting', 'email', 'report', 'home', 'car', 'family', 'personal', 'money', 'other'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, max: number, len: number) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter(Boolean).slice(0, max) : []);

const TOOL = {
  name: 'minutes',
  description: 'Returns the organised minutes of the meeting and its actions.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Two or three sentences: what the meeting was about and what came out of it.' },
      sections: {
        type: 'array',
        description: 'The discussion, grouped by topic, in a sensible order. Every point the user wrote belongs to one section (rephrased clearly), unless it is only a decision or an action already listed below.',
        items: { type: 'object', properties: { heading: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } }, required: ['heading', 'points'] },
      },
      decisions: { type: 'array', items: { type: 'string' }, description: 'What was agreed or decided. Empty if nothing was.' },
      open_questions: { type: 'array', items: { type: 'string' }, description: 'Questions left open, things to confirm. Empty if none.' },
      next_meeting: { type: ['string', 'null'], description: 'The next meeting if one was mentioned, as said (e.g. "الأحد القادم 10:00 ص"), else null.' },
      actions: {
        type: 'array',
        description: 'Everything someone must do after the meeting.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'owner me: starts with the action ("إعداد تقرير…"). owner other: starts with "متابعة" and names the person and the action ("متابعة تسليم سالم لكشف الميزانية").' },
            owner: { type: 'string', enum: ['me', 'other'], description: 'me = the user must do it (they said I / me / my name, or it is clearly their job, or no one else is named). other = a named person or department must do it.' },
            person: { type: ['string', 'null'], description: 'For other: who must do it. For me: the person it is for, if any.' },
            category: { type: 'string', enum: CATS, description: 'Usually a work category: meeting (prepare for / attend a meeting), email (send or reply to an email or letter), report (a report, study, file), work (other work).' },
            priority: { type: 'string', enum: ['high', 'normal', 'low'] },
            due_at: { type: ['string', 'null'], description: 'Deadline, Dubai time, YYYY-MM-DDTHH:MM, if one was given or clearly implied, else null.' },
            remind_at: { type: ['string', 'null'], description: 'When to remind the user, Dubai time, YYYY-MM-DDTHH:MM.' },
            notes: { type: ['string', 'null'], description: 'A detail from the meeting that helps do it (numbers, what exactly is needed).' },
          },
          required: ['title', 'owner', 'category'],
        },
      },
    },
    required: ['summary', 'sections', 'decisions', 'open_questions', 'actions'],
  },
};

function systemPrompt(o: { now: Date; heldAt: Date; title: string; attendees: string; name: string | null; notes: string[]; open: string[]; followUpDays: number; lang: string }): string {
  const language = o.lang === 'en'
    ? 'Write everything in clear, formal, concise English.'
    : 'اكتب كل شيء بالعربية الفصحى الرسمية المبسّطة (لغة محاضر الاجتماعات في الجهات الحكومية)، حتى لو كُتبت النقاط بالعامية أو بخليط من العربية والإنجليزية. احتفظ بأسماء الأنظمة والمصطلحات الإنجليزية كما هي.';
  return `You are Ghaith (غيث), the personal assistant of ${o.name || 'the user'}, an administrative officer at a government entity in the UAE. During a meeting they wrote quick points, as they came, often short, out of order, in dialect. Turn them into proper meeting minutes and pull out every action, using the minutes tool.

${language}

Rules:
- Use only what the points say. Never invent names, numbers, dates or decisions. Rephrase for clarity; you may merge points that say the same thing.
- Group the discussion by topic with short headings.
- A decision is something agreed. An action is something someone must do. A point can be both: list it in both places.
- Owner: "me" when the user must do it (أنا، عليّ، سأ…، their name, or no one else is named and it is the kind of thing they handle); "other" when a named person, team or department must do it.
- Dates and times are relative to the meeting date. Never a time in the past (before now).
  • A day without an hour: due 17:00 that day; remind 09:00 that day (or the day before when it needs preparation).
  • owner me without a date: due null, remind tomorrow 09:00.
  • owner other: remind on the due date at 10:00, or without a date in ${o.followUpDays} days at 10:00, to follow up.
  • "next week" = next Monday, "end of the week" = Friday. The UAE weekend is Saturday and Sunday.
- Do not repeat as actions tasks that are already open (listed below) unless the meeting changed them.
- Call the minutes tool exactly once, with no text before or after.

Now: ${localIso(o.now)} ${weekday(o.now)} (Dubai). Meeting date: ${localIso(o.heldAt)} ${weekday(o.heldAt)}.
${calendar(o.now)}

Meeting title: ${o.title || '(none)'}
Attendees: ${o.attendees || '(not given)'}

Known facts about the user:
${o.notes.length ? o.notes.map((n) => '- ' + n).join('\n') : '(none)'}

The user's open tasks (titles):
${o.open.length ? o.open.map((t) => '- ' + t).join('\n') : '(none)'}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST only');
  let body: { meeting_id?: string; lang?: string };
  try { body = await req.json(); } catch { return fail(400, 'BAD_REQUEST', 'Bad request'); }
  const lang = body.lang === 'en' ? 'en' : 'ar';
  const m = (ar: string, en: string) => (lang === 'en' ? en : ar);

  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return fail(401, 'NOT_SIGNED_IN', m('يرجى تسجيل الدخول أولاً.', 'Please sign in first.'));

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fail(503, 'NOT_CONFIGURED', m('غيث غير مفعّل بعد.', 'Ghaith is not set up yet.'));

  const { data: meeting } = await db.from('ghaith_meetings').select('id,title,held_at,attendees,points').eq('id', String(body.meeting_id ?? '')).maybeSingle();
  if (!meeting) return fail(404, 'NOT_FOUND', m('لم أجد هذا الاجتماع.', 'Meeting not found.'));
  const points = ((meeting.points ?? []) as { text?: string }[]).map((p) => str(p.text, 1000)).filter(Boolean).slice(0, 150);
  if (!points.length) return fail(400, 'EMPTY', m('أضف نقطة واحدة على الأقل.', 'Add at least one point.'));

  const now = new Date();
  const dayStart = new Date(now.getTime() - ((now.getTime() + TZ_OFFSET_H * 3600_000) % 86400_000));
  const { count } = await db.from('ghaith_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', dayStart.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) return fail(429, 'DAILY_LIMIT', m('وصلت إلى الحد اليومي، نكمل غداً.', 'Daily limit reached, see you tomorrow.'));

  const [{ data: open }, { data: settings }, { data: notes }, { data: profile }] = await Promise.all([
    db.from('ghaith_tasks').select('title').eq('status', 'open').order('created_at', { ascending: false }).limit(80),
    db.from('ghaith_settings').select('follow_up_days').maybeSingle(),
    db.from('ghaith_notes').select('fact').order('created_at').limit(80),
    db.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const followUpDays = settings?.follow_up_days ?? 3;
  const system = systemPrompt({
    now,
    heldAt: new Date(meeting.held_at),
    title: meeting.title,
    attendees: meeting.attendees ?? '',
    name: (profile as { display_name?: string } | null)?.display_name ?? null,
    notes: ((notes ?? []) as { fact: string }[]).map((n) => n.fact),
    open: ((open ?? []) as { title: string }[]).map((t) => t.title),
    followUpDays,
    lang,
  });
  const content = points.map((p, i) => `${i + 1}. ${p}`).join('\n');
  await db.from('ghaith_messages').insert({ role: 'user', content: `[meeting] ${meeting.title}`.slice(0, 300), actions: [] });

  let input: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 2 && !input; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, system, tools: [TOOL], messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) {
      console.error('[ghaith-minutes] Claude', res.status, (await res.text()).slice(0, 300));
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      return fail(502, 'UPSTREAM', m('تعذّر الترتيب هذه المرة، حاول بعد قليل.', 'Could not organise it right now, try again shortly.'));
    }
    const out = await res.json();
    input = (out.content ?? []).find((b: { type: string }) => b.type === 'tool_use')?.input ?? null;
    // The model answers in text now and then instead of calling the tool: ask once more
    if (!input && attempt === 0) continue;
    if (!input) return fail(502, 'UPSTREAM', m('تعذّر الترتيب هذه المرة، حاول بعد قليل.', 'Could not organise it right now, try again shortly.'));
  }

  // Checked and shaped: minutes to keep, actions to propose
  const soon = new Date(now.getTime() + 30 * 60_000).toISOString();
  const future = (iso: string | null) => (iso && iso < now.toISOString() ? soon : iso);
  const from = lang === 'en' ? `From the meeting: ${meeting.title}` : `من اجتماع: ${meeting.title}`;
  const actions = (Array.isArray(input!.actions) ? input!.actions : []).slice(0, 40).map((a: Record<string, unknown>) => {
    const mine = a.owner !== 'other';
    const due = parseWhen(a.due_at);
    const remind = future(parseWhen(a.remind_at));
    return {
      title: str(a.title, 300),
      owner: mine ? 'me' : 'other',
      person: str(a.person, 120) || null,
      category: CATS.includes(String(a.category)) ? String(a.category) : 'work',
      priority: ['high', 'normal', 'low'].includes(String(a.priority)) ? String(a.priority) : 'normal',
      due_at: due,
      remind_at: remind,
      notes: [str(a.notes, 1500), from].filter(Boolean).join('\n'),
    };
  }).filter((a: { title: string }) => a.title);
  const proposals = actions.map((a: { title: string; owner: string; person: string | null; category: string; priority: string; due_at: string | null; remind_at: string | null; notes: string }) => ({
    op: 'add',
    task: { title: a.title, kind: a.owner === 'me' ? 'todo' : 'waiting', category: a.category, priority: a.priority, person: a.person, due_at: a.due_at, remind_at: a.remind_at, repeat: null, notes: a.notes },
  }));
  const minutes = {
    summary: str(input!.summary, 1500),
    sections: (Array.isArray(input!.sections) ? input!.sections : []).slice(0, 20).map((s: Record<string, unknown>) => ({ heading: str(s.heading, 200), points: list(s.points, 30, 800) })).filter((s: { heading: string; points: string[] }) => s.heading && s.points.length),
    decisions: list(input!.decisions, 30, 600),
    open_questions: list(input!.open_questions, 20, 600),
    next_meeting: str(input!.next_meeting, 200) || null,
    actions,
    proposals,
    model: MODEL,
  };
  const { error } = await db.from('ghaith_meetings').update({ minutes, organized_at: now.toISOString() }).eq('id', meeting.id);
  if (error) console.error('[ghaith-minutes] save', error.message);
  return reply(200, { minutes });
});
