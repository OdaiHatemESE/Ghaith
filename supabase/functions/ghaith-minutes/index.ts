// ghaith-minutes: organises a meeting's points into minutes and proposes its actions as tasks, or, for a learning
// session (a course, training or talk: kind 'learning'), organises the notes into what to keep: takeaways, terms,
// what to read more about, how to apply it. Nothing from a learning session is proposed as a task.
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

// ---------- learning (a course, training, talk or reading) ----------
const LEARN_TOOL = {
  name: 'learning',
  description: 'Returns the organised notes of what the user learned.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Two or three sentences: what the session was about and its main message.' },
      takeaways: {
        type: 'array',
        description: 'The ideas worth keeping, most important first (points tagged key first). 3 to 8.',
        items: { type: 'object', properties: { title: { type: 'string', description: 'The idea in a few words.' }, detail: { type: 'string', description: 'One or two sentences that make it clear and usable.' } }, required: ['title', 'detail'] },
      },
      sections: {
        type: 'array',
        description: 'All the notes, grouped by topic and rephrased clearly. Every note belongs to one section.',
        items: { type: 'object', properties: { heading: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } }, required: ['heading', 'points'] },
      },
      terms: {
        type: 'array',
        description: 'Terms, tools or concepts mentioned that deserve a short definition. Only ones you can define accurately. Empty if none.',
        items: { type: 'object', properties: { term: { type: 'string' }, meaning: { type: 'string', description: 'One clear sentence.' } }, required: ['term', 'meaning'] },
      },
      read_more: {
        type: 'array',
        description: 'Topics to read more about: every note tagged read, plus at most 2 others clearly worth deepening.',
        items: { type: 'object', properties: { topic: { type: 'string' }, why: { type: 'string', description: 'Why it is worth reading, in one sentence.' }, search: { type: 'string', description: 'A good web search phrase for it (English for technical topics).' } }, required: ['topic', 'why', 'search'] },
      },
      apply: { type: 'array', items: { type: 'string' }, description: '2 to 4 concrete ways to apply this in the user’s work. Empty if it does not apply.' },
      questions: {
        type: 'array',
        description: 'Questions the user noted (tagged question, or written as a question).',
        items: { type: 'object', properties: { q: { type: 'string' }, answer: { type: ['string', 'null'], description: 'A short accurate answer if you are confident, else null.' } }, required: ['q'] },
      },
      quotes: { type: 'array', items: { type: 'string' }, description: 'Notes tagged quote, kept word for word.' },
    },
    required: ['summary', 'takeaways', 'sections', 'terms', 'read_more', 'apply', 'questions', 'quotes'],
  },
};

const TAGS: Record<string, string> = { key: 'KEY', read: 'READ MORE', question: 'QUESTION', quote: 'QUOTE' };

function learnPrompt(o: { title: string; by: string; name: string | null; notes: string[]; lang: string }): string {
  const language = o.lang === 'en'
    ? 'Write everything in clear, concise English.'
    : 'اكتب بالعربية الفصحى المبسّطة الواضحة، حتى لو كُتبت الملاحظات بالعامية أو بخليط من العربية والإنجليزية. احتفظ بأسماء الأدوات والمصطلحات الإنجليزية كما هي، ويمكنك ذكر المقابل العربي بجانبها.';
  return `You are Ghaith (غيث), the personal assistant of ${o.name || 'the user'}, an administrative officer at a government entity in the UAE. During a course, training, talk or reading they wrote quick notes, as they came. Turn them into a learning note they will keep and come back to, using the learning tool. This is not a meeting: there are no tasks, owners or deadlines.

${language}

Rules:
- The notes are the source. Rephrase for clarity and group by topic; you may merge notes that say the same thing. Never invent what the speaker said.
- You may add your own knowledge only where the schema asks for it (term meanings, why a topic is worth reading, how to apply it, answers to questions), and only when you are sure it is accurate.
- Notes tagged KEY are the user's most important ideas: lead the takeaways with them. Notes tagged READ MORE all go in read_more. Notes tagged QUOTE go in quotes word for word. Notes tagged QUESTION go in questions.
- Call the learning tool exactly once, with no text before or after.

Session: ${o.title || '(no title)'}
Given by: ${o.by || '(not given)'}

Known facts about the user:
${o.notes.length ? o.notes.map((n) => '- ' + n).join('\n') : '(none)'}`;
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

  const { data: meeting } = await db.from('ghaith_meetings').select('id,kind,title,held_at,attendees,points').eq('id', String(body.meeting_id ?? '')).maybeSingle();
  if (!meeting) return fail(404, 'NOT_FOUND', m('لم أجد هذا الاجتماع.', 'Meeting not found.'));
  const learning = meeting.kind === 'learning';
  const points = ((meeting.points ?? []) as { text?: string; tag?: string }[])
    .map((p) => {
      const t = str(p.text, 1000);
      return t && learning && p.tag && TAGS[p.tag] ? `[${TAGS[p.tag]}] ${t}` : t;
    })
    .filter(Boolean)
    .slice(0, 150);
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
  const factList = ((notes ?? []) as { fact: string }[]).map((n) => n.fact);
  const displayName = (profile as { display_name?: string } | null)?.display_name ?? null;
  const system = learning
    ? learnPrompt({ title: meeting.title, by: meeting.attendees ?? '', name: displayName, notes: factList, lang })
    : systemPrompt({
        now,
        heldAt: new Date(meeting.held_at),
        title: meeting.title,
        attendees: meeting.attendees ?? '',
        name: displayName,
        notes: factList,
        open: ((open ?? []) as { title: string }[]).map((t) => t.title),
        followUpDays,
        lang,
      });
  const content = points.map((p, i) => `${i + 1}. ${p}`).join('\n');
  await db.from('ghaith_messages').insert({ role: 'user', content: `[${learning ? 'learning' : 'meeting'}] ${meeting.title}`.slice(0, 300), actions: [] });

  let input: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 2 && !input; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, system, tools: [learning ? LEARN_TOOL : TOOL], messages: [{ role: 'user', content }] }),
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

  // A learning note: checked and shaped, nothing proposed as a task
  if (learning) {
    const i = input!;
    const objs = (v: unknown, max: number) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === 'object').slice(0, max) : []);
    const note = {
      summary: str(i.summary, 1500),
      takeaways: objs(i.takeaways, 12).map((t) => ({ title: str(t.title, 200), detail: str(t.detail, 800) })).filter((t) => t.title),
      sections: objs(i.sections, 20).map((x) => ({ heading: str(x.heading, 200), points: list(x.points, 30, 800) })).filter((x) => x.heading && x.points.length),
      terms: objs(i.terms, 20).map((t) => ({ term: str(t.term, 120), meaning: str(t.meaning, 600) })).filter((t) => t.term && t.meaning),
      read_more: objs(i.read_more, 12).map((t) => ({ topic: str(t.topic, 200), why: str(t.why, 600), search: str(t.search, 200) })).filter((t) => t.topic),
      apply: list(i.apply, 6, 600),
      questions: objs(i.questions, 12).map((t) => ({ q: str(t.q, 400), answer: str(t.answer, 800) || null })).filter((t) => t.q),
      quotes: list(i.quotes, 10, 600),
      model: MODEL,
    };
    const { error } = await db.from('ghaith_meetings').update({ minutes: note, organized_at: now.toISOString() }).eq('id', meeting.id);
    if (error) console.error('[ghaith-minutes] save', error.message);
    return reply(200, { minutes: note });
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
