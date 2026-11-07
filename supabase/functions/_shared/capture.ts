// The capture engine: one capture (a voice transcript, typed text, or an email) in, the list of proposed changes
// out (new tasks, edits, tasks to mark done or delete). Nothing is written here. Shared by ghaith-capture (the app,
// as the signed-in user) and ghaith-inbox (emails sent to Ghaith), so both understand requests the same way.

export const TZ_OFFSET_H = 4; // Asia/Dubai, no daylight saving

// ---------- time (the model works in Dubai local time) ----------
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
  for (let i = 0; i < 21; i++) {
    const d = new Date(now.getTime() + i * 86400_000);
    const label = i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : '';
    lines.push(`${localIso(d).slice(0, 10)} ${weekday(d)}${label}`);
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

const CATS = ['work', 'home', 'car', 'family', 'personal', 'money', 'other'];
const KINDS = ['todo', 'waiting', 'reply'];
const REPEATS = ['daily', 'weekly', 'monthly', 'yearly'];
const FIELDS = 'id,title,notes,kind,category,priority,person,due_at,remind_at,repeat,status,created_at';
type Task = { id: string; title: string; notes: string | null; kind: string; category: string; priority: string; person: string | null; due_at: string | null; remind_at: string | null; repeat: string | null; status: string; created_at: string };

const TOOL = {
  name: 'plan',
  description: 'Returns every change the user asked for, in order: new tasks, edits to existing tasks, tasks to mark done, tasks to delete.',
  input_schema: {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['add', 'update', 'complete', 'delete'] },
            id: { type: ['string', 'null'], description: 'For update/complete/delete: the 8-character id of the existing task from the list. null for add.' },
            title: { type: ['string', 'null'], description: 'add: a short title that starts with the action and names the subject and the person/party. update: only if the title should change.' },
            kind: { type: ['string', 'null'], enum: [...KINDS, null], description: 'todo = something I must do. waiting = I asked someone and am waiting for their reply or delivery. reply = someone sent me something and I must reply.' },
            category: { type: ['string', 'null'], enum: [...CATS, null] },
            priority: { type: ['string', 'null'], enum: ['high', 'normal', 'low', null] },
            person: { type: ['string', 'null'], description: 'The person or party involved' },
            due_at: { type: ['string', 'null'], description: 'Deadline, Dubai time, YYYY-MM-DDTHH:MM' },
            remind_at: { type: ['string', 'null'], description: 'Reminder time, Dubai time, YYYY-MM-DDTHH:MM' },
            repeat: { type: ['string', 'null'], enum: [...REPEATS, null] },
            notes: { type: ['string', 'null'] },
            change: { type: ['string', 'null'], description: 'update only: a very short description of the change in the user’s language, e.g. "تأجيل الموعد إلى الإثنين 9:00 ص" or "Moved to Monday 9:00 AM"' },
            unsure: { type: 'boolean', description: 'true when more than one existing task could be meant and you picked the most likely one' },
          },
          required: ['op'],
        },
      },
    },
    required: ['actions'],
  },
};

function describe(t: Task, now: Date): string {
  const p = [`[${t.id.slice(0, 8)}] ${t.title}`, `kind: ${t.kind}`, `category: ${t.category}`];
  if (t.priority !== 'normal') p.push(`priority: ${t.priority}`);
  if (t.person) p.push(`person: ${t.person}`);
  if (t.due_at) p.push(`due: ${localIso(new Date(t.due_at))} ${weekday(new Date(t.due_at))}${new Date(t.due_at) < now ? ' (overdue)' : ''}`);
  if (t.remind_at) p.push(`remind: ${localIso(new Date(t.remind_at))}`);
  if (t.repeat) p.push(`repeats: ${t.repeat}`);
  p.push(`added: ${localIso(new Date(t.created_at)).slice(0, 10)}`);
  return p.join(' | ');
}

function systemPrompt(now: Date, followUpDays: number, open: Task[], notes: string[], source: string, lang: string): string {
  const language = lang === 'en'
    ? 'Write every title, note and change description in clear, concise English.'
    : 'اكتب كل العناوين والملاحظات ووصف التعديلات بالعربية الفصحى المبسّطة والمرتّبة (مثل: "الرد على بريد خالد بشأن العقد"، "متابعة رد سارة على عرض السعر")، وليس باللهجة العامية، حتى لو تكلّم المستخدم بالعامية.';
  return `You are Ghaith (غيث), a task assistant for an administrative officer at a government entity in the UAE. The user gives you one capture (${source === 'voice' ? 'a voice recording turned into text, in Arabic dialect, which may contain transcription mistakes: understand what was meant' : source === 'email' ? 'an email: one they received and pasted, or one they forwarded or wrote to Ghaith. If they wrote a note above a forwarded message (e.g. "remind me Sunday", "follow up with them"), that note says what they want; otherwise take what they must do (reply / todo) and what they are waiting for from the message, and name the sender as the person' : 'text they typed'}). Turn it into the list of changes they want, using the plan tool. There is no conversation and no reply: only the plan.

${language}

Now: ${localIso(now)} ${weekday(now)} (Dubai time). The UAE weekend is Saturday and Sunday.
${calendar(now)}

Open tasks (id in brackets):
${open.length ? open.map((t) => '- ' + describe(t, now)).join('\n') : '(none)'}

Known facts about the user:
${notes.length ? notes.map((n) => '- ' + n).join('\n') : '(none)'}

Deciding what to do (most important):
- The user can ask for anything in one go: add new tasks, change existing ones, mark them done, delete them. Return one action per thing asked, in the order said.
- update: when they refer to an existing task and change something about it: postpone / move / change / edit / set a time / rename / add a detail / make it urgent ("عدّل، غيّر، أجّل، انقل، قدّم، خلّيها، حط لها، صحّح، زيد عليها"). Send only the fields that change, plus "change". Moving a task moves its deadline and its reminder together.
- complete: when they say it is done or the awaited reply arrived ("خلصت، انتهيت، أنجزت، بعتّه، فلان رد، وصلني").
- delete: only when they clearly cancel or remove it ("احذف، الغِ، شيلها، ما عاد بدي").
- add: anything new ("ضيف، سجّل، ذكّرني، عندي، لازم، بدي"). Similar words alone are not a reason to edit an existing task: several tasks can look alike (replies to different people).
- If the user describes an existing task again with new details (a new time, a person, a note), that is an update of it, never a second copy.
- If more than one task could be meant, pick the most likely one and set unsure: true.
- Ignore what isn't a request (greetings, thinking aloud).

Fields for new tasks:
- title: starts with the action, names the subject and the person/party. No words like "remind me" or "must".
- kind: "I must do / prepare / finish" = todo. "I sent to X and I'm waiting / X will send me" = waiting. "X sent me / I must reply to" = reply.
- category from context: manager, meeting, report, work email, a government party = work. Insurance / registration / service / fine = car. Bill / payment = money. When unclear and it is about an email or a colleague = work.
- priority high only when they say urgent / important, or it is work due today or tomorrow.
- Times (Dubai):
  • morning 09:00, noon 13:00, afternoon 16:00, evening 19:00, night 21:00.
  • "next week" = next Monday. "end of the week" = Friday. "end of the month" = its last day.
  • A day without an hour: due_at 17:00 that day, remind_at 09:00 that day.
  • A day with an hour: remind_at one hour before, unless they gave the reminder time.
  • waiting without a date: remind_at a follow-up in ${followUpDays} days at 10:00.
  • reply without a date: remind_at tomorrow 09:00 (or in two hours if now is within working hours).
  • todo with no hint of time at all: due_at and remind_at null (the user picks a time while reviewing).
  • "before the meeting / before <day>": due_at before it, remind_at 09:00 the day before.
  • Never a time in the past.
- Always call plan exactly once, with no text before or after. If nothing was asked, call it with an empty list.`;
}

export type CaptureTask = Task;
export const CAPTURE_FIELDS = FIELDS;

/** Asks Claude for the plan and checks every proposed change against the open tasks */
export async function planCapture(o: { apiKey: string; model: string; text: string; source: string; lang: string; now: Date; open: Task[]; notes: string[]; followUpDays: number }): Promise<{ actions: Record<string, unknown>[] } | { error: 'UPSTREAM' }> {
  const { apiKey, model, text, source, lang, now, open, notes, followUpDays } = o;
  const system = systemPrompt(now, followUpDays, open, notes, source, lang);

  let input: { actions?: Record<string, unknown>[] } | null = null;
  for (let attempt = 0; attempt < 2 && !input; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4000, system, tools: [TOOL], messages: [{ role: 'user', content: text }] }),
    });
    if (!res.ok) {
      console.error('[ghaith-capture] Claude', res.status, (await res.text()).slice(0, 300));
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      return { error: 'UPSTREAM' };
    }
    const out = await res.json();
    const use = (out.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
    input = use?.input ?? { actions: [] };
  }

  const soon = new Date(now.getTime() + 30 * 60_000).toISOString();
  const future = (iso: string | null) => (iso && iso < now.toISOString() ? soon : iso);
  const byShort = (s: unknown) => {
    const k = String(s ?? '').replace(/[^0-9a-f-]/gi, '').toLowerCase();
    return k.length >= 6 ? open.find((t) => t.id.startsWith(k)) ?? null : null;
  };
  const pick = (a: Record<string, unknown>) => {
    const f: Record<string, unknown> = {};
    if (a.title) f.title = String(a.title).trim().slice(0, 300);
    if (KINDS.includes(String(a.kind))) f.kind = a.kind;
    if (CATS.includes(String(a.category))) f.category = a.category;
    if (['high', 'normal', 'low'].includes(String(a.priority))) f.priority = a.priority;
    if (a.person !== undefined && a.person !== null) f.person = String(a.person).slice(0, 120) || null;
    if (a.notes !== undefined && a.notes !== null) f.notes = String(a.notes).slice(0, 2000) || null;
    if (a.repeat !== undefined) f.repeat = REPEATS.includes(String(a.repeat)) ? a.repeat : null;
    if (a.due_at !== undefined) f.due_at = parseWhen(a.due_at);
    if (a.remind_at !== undefined) f.remind_at = future(parseWhen(a.remind_at));
    return f;
  };

  const actions: Record<string, unknown>[] = [];
  for (const a of (input?.actions ?? []).slice(0, 30)) {
    const op = String(a.op);
    if (op === 'add') {
      const f = pick(a);
      if (!f.title) continue;
      actions.push({
        op,
        task: { title: f.title, kind: f.kind ?? 'todo', category: f.category ?? 'other', priority: f.priority ?? 'normal', person: f.person ?? null, due_at: f.due_at ?? null, remind_at: f.remind_at ?? null, repeat: f.repeat ?? null, notes: f.notes ?? null },
      });
      continue;
    }
    const t = byShort(a.id);
    if (!t) continue;
    const current = { id: t.id, title: t.title, kind: t.kind, category: t.category, priority: t.priority, person: t.person, due_at: t.due_at, remind_at: t.remind_at, repeat: t.repeat, notes: t.notes };
    if (op === 'update') {
      const changes = pick(a);
      if (!Object.keys(changes).length) continue;
      actions.push({ op, id: t.id, current, changes, change: a.change ? String(a.change).slice(0, 200) : null, unsure: !!a.unsure });
    } else if (op === 'complete' || op === 'delete') {
      actions.push({ op, id: t.id, current, unsure: !!a.unsure });
    }
  }


  return { actions };
}
