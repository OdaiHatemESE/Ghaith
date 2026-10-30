// ghaith-agent: غيث's brain. Takes what the user said (voice transcript or typed text), lets Claude act on the
// user's tasks through tools (add, update, complete, delete, search), and returns a short spoken-style Arabic reply.
// Every database call goes through a client that acts as the signed-in user, so row-level security applies.
//
// Secrets: ANTHROPIC_API_KEY (required), GHAITH_MODEL (optional, default below).
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

const MODEL = Deno.env.get('GHAITH_MODEL') || 'claude-haiku-5-5';
const MAX_STEPS = 6;
const DAILY_LIMIT = 300;
const TZ_OFFSET_H = 4; // Asia/Dubai, no daylight saving

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => reply(status, { error: code, message });

// ---------- time helpers (everything the model sees is Dubai local time) ----------
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const local = (d: Date) => new Date(d.getTime() + TZ_OFFSET_H * 3600_000);
const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-11-02T10:00+04:00" */
function localIso(d: Date): string {
  const l = local(d);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}T${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}+04:00`;
}
const weekday = (d: Date) => DAYS[local(d).getUTCDay()];
function calendar(now: Date): string {
  const lines: string[] = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(now.getTime() + i * 86400_000);
    const label = i === 0 ? ' (اليوم)' : i === 1 ? ' (بكرة)' : i === 2 ? ' (بعد بكرة)' : '';
    lines.push(`${localIso(d).slice(0, 10)} ${weekday(d)}${label}`);
  }
  return lines.join('\n');
}
/** Accepts what the model sends ("2026-11-02T10:00", with or without offset) and returns a UTC ISO string, or null */
function parseWhen(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T09:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += '+04:00';
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

// ---------- tasks ----------
type Task = {
  id: string; title: string; notes: string | null; kind: string; category: string; priority: string; person: string | null;
  due_at: string | null; remind_at: string | null; repeat: string | null; status: string; done_at: string | null; created_at: string;
};
const KIND_AR: Record<string, string> = { todo: 'عليّ', waiting: 'ناطر رد', reply: 'لازم أرد' };
const CAT_AR: Record<string, string> = { work: 'عمل', home: 'بيت', car: 'سيارة', family: 'عائلة', personal: 'شخصي', money: 'فلوس', other: 'أخرى' };
const FIELDS = 'id,title,notes,kind,category,priority,person,due_at,remind_at,repeat,status,done_at,created_at';

function describe(t: Task, now: Date): string {
  const parts = [`[${t.id.slice(0, 8)}] ${t.title}`, `نوع: ${t.kind}`, `تصنيف: ${t.category}`];
  if (t.priority !== 'normal') parts.push(`أولوية: ${t.priority}`);
  if (t.person) parts.push(`الشخص: ${t.person}`);
  if (t.due_at) parts.push(`الموعد: ${localIso(new Date(t.due_at))} ${weekday(new Date(t.due_at))}${new Date(t.due_at) < now ? ' (متأخر)' : ''}`);
  if (t.remind_at) parts.push(`التذكير: ${localIso(new Date(t.remind_at))}`);
  if (t.repeat) parts.push(`يتكرر: ${t.repeat}`);
  if (t.notes) parts.push(`ملاحظات: ${t.notes.slice(0, 160)}`);
  parts.push(`أضيفت: ${localIso(new Date(t.created_at)).slice(0, 10)}`);
  if (t.status === 'done' && t.done_at) parts.push(`انتهت: ${localIso(new Date(t.done_at)).slice(0, 10)}`);
  return parts.join(' | ');
}

type Action = { type: 'added' | 'updated' | 'done' | 'deleted' | 'reopened'; id: string; title: string };

const taskProps = {
  title: { type: 'string', description: 'عنوان قصير وواضح للمهمة بصيغة فعل، مثل "تجديد تأمين السيارة" أو "الرد على إيميل أحمد بخصوص العقد"' },
  kind: { type: 'string', enum: ['todo', 'waiting', 'reply'], description: 'todo = شغلة عليّ أعملها. waiting = طلبت شيء من حدا وناطر رده/تسليمه. reply = حدا بعتلي (إيميل/رسالة/طلب) ولازم أرد عليه' },
  category: { type: 'string', enum: Object.keys(CAT_AR), description: 'work عمل، home بيت، car سيارة، family عائلة/أولاد، personal شخصي/صحة/مواعيد خاصة، money فواتير/دفعات/بنك، other' },
  priority: { type: 'string', enum: ['high', 'normal', 'low'] },
  person: { type: ['string', 'null'], description: 'الشخص أو الجهة المرتبطة (المدير، أحمد، قسم IT، البنك...) إن وجد' },
  due_at: { type: ['string', 'null'], description: 'الموعد النهائي بتوقيت دبي بصيغة YYYY-MM-DDTHH:MM، أو null إذا ما في موعد' },
  remind_at: { type: ['string', 'null'], description: 'وقت التذكير بتوقيت دبي بصيغة YYYY-MM-DDTHH:MM' },
  repeat: { type: ['string', 'null'], enum: ['daily', 'weekly', 'monthly', 'yearly', null] },
  notes: { type: ['string', 'null'], description: 'تفاصيل إضافية مفيدة قالها المستخدم (أرقام، أسماء، المطلوب بالضبط)' },
};

const TOOLS = [
  {
    name: 'add_tasks',
    description: 'يضيف مهمة أو أكثر. افصل كل شغلة مستقلة بمهمة لحالها.',
    input_schema: {
      type: 'object',
      properties: { tasks: { type: 'array', items: { type: 'object', properties: taskProps, required: ['title', 'kind', 'category'] } } },
      required: ['tasks'],
    },
  },
  {
    name: 'update_task',
    description: 'يعدّل مهمة موجودة: تأجيل، تغيير الموعد أو التذكير أو التصنيف أو العنوان أو النوع، إضافة ملاحظة. أرسل فقط الحقول اللي بدها تتغير.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'رقم المهمة (أول 8 خانات بين القوسين)' }, ...taskProps },
      required: ['id'],
    },
  },
  {
    name: 'complete_task',
    description: 'يعلّم مهمة إنها خلصت (وصل الرد، انعملت، انبعت الرد). المهام المتكررة بتنضاف نسختها الجاية تلقائياً.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'reopen_task',
    description: 'يرجّع مهمة منتهية لمفتوحة.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'delete_task',
    description: 'يحذف مهمة نهائياً. فقط إذا المستخدم طلب الحذف أو الإلغاء صراحة.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'search_tasks',
    description: 'يبحث بالمهام المنتهية أو القديمة (المفتوحة موجودة عندك أصلاً). استخدمه لأسئلة مثل "شو خلصت هالأسبوع" أو "شو صار بموضوع كذا".',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: ['string', 'null'], description: 'كلمة للبحث بالعنوان أو الملاحظات أو الشخص' },
        status: { type: 'string', enum: ['open', 'done', 'any'] },
        done_since: { type: ['string', 'null'], description: 'YYYY-MM-DD: المهام اللي خلصت من هالتاريخ' },
      },
    },
  },
];

function systemPrompt(now: Date, open: Task[], followUpDays: number, name: string | null): string {
  const list = open.length ? open.map((t) => '- ' + describe(t, now)).join('\n') : '(ما في مهام مفتوحة)';
  return `أنت "غيث"، السكرتير والمساعد الشخصي${name ? ` لـ ${name}` : ''}. هو موظف إداري بجهة حكومية بالإمارات، عنده إيميلات ومهام كثيرة وبينسى. شغلتك تدير مهامه: تسجّلها، تصنّفها، تذكّره فيها، وتتابع معه لحد ما تخلص. غالباً بيحكي معك بالصوت وهو سايق أو ماشي، فالنص اللي بيوصلك تحويل صوت لنص وممكن فيه أخطاء إملائية بسيطة: افهم المقصود.

الوقت الآن: ${localIso(now)} يوم ${weekday(now)} (توقيت دبي). الويك إند بالإمارات السبت والأحد.
التقويم للأيام الجاية:
${calendar(now)}

المهام المفتوحة حالياً:
${list}

كيف تشتغل:
- نفّذ مباشرة بالأدوات. لا تسأل "بدك أضيفها؟"؛ أضف وخبّره شو عملت. اسأل فقط إذا الطلب غامض فعلاً (مثلاً ما بتعرف أي مهمة قصده بين مهمتين متشابهتين).
- جملة وحدة ممكن يكون فيها أكثر من مهمة أو أمر: نفّذهم كلهم.
- لما يحكي عن مهمة موجودة ("أجّل موضوع السيارة"، "خلصت الإيميل")، طابقها من القائمة فوق بالمعنى واستخدم رقمها. لا تضيف مهمة مكررة.
- النوع: "لازم أعمل/أخلّص/أجهّز" = todo. "بعتت لفلان وناطر/طلبت من/فلان رح يبعتلي" = waiting. "فلان بعتلي/وصلني إيميل/لازم أرد على" = reply.
- التصنيف: خمّن من السياق (المدير، الاجتماع، البوابة، التقرير، إيميل شغل = work؛ تأمين/تسجيل/صيانة/مخالفة سيارة = car؛ فواتير/دفعات = money؛ أغراض/تصليح البيت = home؛ الأولاد/المدرسة/الأهل = family). إذا مش واضح وكان الكلام عن إيميل أو شخص بالشغل فهو work.
- الأولوية high فقط إذا قال مستعجل/ضروري/مهم جداً أو الموعد اليوم أو بكرة لشغلة شغل حساسة.
- قواعد الأوقات (كلها بتوقيت دبي):
  • "الصبح" = 09:00، "الظهر" = 13:00، "العصر" = 16:00، "المسا" = 19:00، "الليل" = 21:00. "بعد ساعة/ساعتين" من الوقت الحالي.
  • "بكرة" = اليوم التالي. "آخر الأسبوع" = الجمعة. "الأسبوع الجاي" = الاثنين الجاي. "آخر الشهر" = آخر يوم بالشهر.
  • إذا في موعد بدون وقت: الموعد 17:00 بذاك اليوم، والتذكير 09:00 بنفس اليوم (أو قبل بيوم 09:00 إذا الشغلة بدها تحضير).
  • إذا في موعد مع وقت: التذكير قبله بساعة (أو قبل بيوم إذا كان أكثر من 3 أيام لقدام وبدها تحضير)، إلا إذا حدد هو وقت التذكير.
  • todo بدون أي موعد: تذكير بكرة 09:00 (أو بعد ساعتين إذا قال "اليوم").
  • waiting بدون موعد: تذكير متابعة بعد ${followUpDays} أيام الساعة 10:00 عشان يلحق الشخص.
  • reply بدون موعد: تذكير بعد ساعتين إذا بأوقات الدوام، أو الساعة 09:00 الصبح الجاي.
  • لا تحط تذكير بالماضي أبداً. لما يأجّل مهمة، حرّك الموعد والتذكير مع بعض.
- لما يقول "خلصت/انعملت/رد علي/وصلني" عن مهمة: complete_task. لما يقول "فلان رد بس لسا لازم أعمل كذا": خلّص القديمة وأضف الجديدة.
- لما يسأل "شو عندي؟" أو "شو المتأخر؟": جاوب من القائمة فوق، الأهم والمتأخر أول، باختصار.
- "ذكّرني" يعني أضف مهمة (أو عدّل التذكير إذا المهمة موجودة).

الرد:
- عربي بلهجة بيضاء قريبة من الشامية والخليجية، قصير جداً (جملة أو جملتين، والأسئلة عن القائمة ممكن أطول شوي)، لأنه غالباً بينقرأ بصوت عالي وهو سايق.
- بدون markdown، بدون نجوم أو عناوين أو إيموجي. استخدم فواصل وجمل طبيعية.
- اذكر الأوقات بشكل طبيعي ("بكرة الساعة 9 الصبح"، "الأحد الجاي") مش بأرقام ISO، ولا تذكر أرقام المهام.
- إذا ما في شيء ينعمل (سلام، شكراً)، رد بلطف وباختصار.`;
}

// ---------- Claude ----------
type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> };
type Msg = { role: 'user' | 'assistant'; content: string | Record<string, unknown>[] };

async function callClaude(apiKey: string, system: string, messages: Msg[]): Promise<{ content: Block[]; stop_reason: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, tools: TOOLS, messages }),
    });
    if (res.ok) return await res.json();
    const text = (await res.text()).slice(0, 400);
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    throw new Error(`Claude ${res.status}: ${text}`);
  }
  throw new Error('Claude unavailable');
}

// ---------- tool execution ----------
async function resolveId(db: SupabaseClient, short: unknown): Promise<Task | null> {
  const s = String(short ?? '').replace(/[^0-9a-f-]/gi, '').toLowerCase();
  if (s.length < 6) return null;
  const { data } = await db.from('ghaith_tasks').select(FIELDS).order('created_at', { ascending: false }).limit(500);
  return (data as Task[] | null)?.find((t) => t.id.startsWith(s)) ?? null;
}

function cleanFields(input: Record<string, unknown>, partial: boolean): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = String(input.title).trim().slice(0, 300);
  if (!partial && !out.title) return 'العنوان ناقص';
  if (input.kind !== undefined) { if (!['todo', 'waiting', 'reply'].includes(String(input.kind))) return 'نوع غير صالح'; out.kind = input.kind; }
  if (input.category !== undefined) out.category = CAT_AR[String(input.category)] ? input.category : 'other';
  if (input.priority !== undefined) out.priority = ['high', 'normal', 'low'].includes(String(input.priority)) ? input.priority : 'normal';
  if (input.person !== undefined) out.person = input.person ? String(input.person).slice(0, 120) : null;
  if (input.notes !== undefined) out.notes = input.notes ? String(input.notes).slice(0, 2000) : null;
  if (input.repeat !== undefined) out.repeat = ['daily', 'weekly', 'monthly', 'yearly'].includes(String(input.repeat)) ? input.repeat : null;
  for (const k of ['due_at', 'remind_at'] as const) {
    const v = parseWhen(input[k]);
    if (v === undefined && input[k] !== undefined) return `صيغة الوقت ${k} غير مفهومة: ${input[k]}`;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

async function runTool(db: SupabaseClient, name: string, input: Record<string, unknown>, source: string, actions: Action[], now: Date): Promise<string> {
  if (name === 'add_tasks') {
    const list = Array.isArray(input.tasks) ? input.tasks.slice(0, 15) : [];
    const rows: Record<string, unknown>[] = [];
    for (const t of list) {
      const f = cleanFields(t as Record<string, unknown>, false);
      if (typeof f === 'string') return `خطأ: ${f}`;
      if (f.remind_at && new Date(f.remind_at as string) < now) f.remind_at = new Date(now.getTime() + 30 * 60_000).toISOString();
      rows.push({ ...f, source });
    }
    if (!rows.length) return 'خطأ: ما في مهام';
    const { data, error } = await db.from('ghaith_tasks').insert(rows).select(FIELDS);
    if (error) return `خطأ: ${error.message}`;
    for (const t of data as Task[]) actions.push({ type: 'added', id: t.id, title: t.title });
    return 'تمت الإضافة:\n' + (data as Task[]).map((t) => describe(t, now)).join('\n');
  }

  if (name === 'search_tasks') {
    let q = db.from('ghaith_tasks').select(FIELDS).order('updated_at', { ascending: false }).limit(25);
    const status = String(input.status ?? 'any');
    if (status !== 'any') q = q.eq('status', status);
    if (input.done_since) { const d = parseWhen(String(input.done_since).slice(0, 10) + 'T00:00'); if (d) q = q.gte('done_at', d); }
    if (input.text) {
      const t = String(input.text).replace(/[%,()]/g, ' ').trim();
      if (t) q = q.or(`title.ilike.%${t}%,notes.ilike.%${t}%,person.ilike.%${t}%`);
    }
    const { data, error } = await q;
    if (error) return `خطأ: ${error.message}`;
    return (data as Task[]).length ? (data as Task[]).map((t) => `${describe(t, now)} | الحالة: ${t.status}`).join('\n') : 'ما لقيت شيء';
  }

  const task = await resolveId(db, input.id);
  if (!task) return 'خطأ: ما لقيت مهمة بهالرقم. استخدم رقم من القائمة.';

  if (name === 'update_task') {
    const { id: _id, ...rest } = input;
    const f = cleanFields(rest, true);
    if (typeof f === 'string') return `خطأ: ${f}`;
    if (!Object.keys(f).length) return 'ما في شيء يتغير';
    if (f.remind_at && new Date(f.remind_at as string) < now) return 'خطأ: وقت التذكير بالماضي، اختر وقت جاي';
    const { data, error } = await db.from('ghaith_tasks').update(f).eq('id', task.id).select(FIELDS).single();
    if (error) return `خطأ: ${error.message}`;
    actions.push({ type: 'updated', id: task.id, title: (data as Task).title });
    return 'تم التعديل: ' + describe(data as Task, now);
  }
  if (name === 'complete_task') {
    if (task.status === 'done') return 'المهمة منتهية من قبل';
    const { data: nextId, error } = await db.rpc('ghaith_complete_task', { p_id: task.id });
    if (error) return `خطأ: ${error.message}`;
    actions.push({ type: 'done', id: task.id, title: task.title });
    if (nextId) {
      const { data: next } = await db.from('ghaith_tasks').select(FIELDS).eq('id', nextId).single();
      return `تمت. ولأنها متكررة انضافت الجاية: ${next ? describe(next as Task, now) : ''}`;
    }
    return 'تمت';
  }
  if (name === 'reopen_task') {
    const { error } = await db.from('ghaith_tasks').update({ status: 'open' }).eq('id', task.id);
    if (error) return `خطأ: ${error.message}`;
    actions.push({ type: 'reopened', id: task.id, title: task.title });
    return 'رجعت مفتوحة';
  }
  if (name === 'delete_task') {
    const { error } = await db.from('ghaith_tasks').delete().eq('id', task.id);
    if (error) return `خطأ: ${error.message}`;
    actions.push({ type: 'deleted', id: task.id, title: task.title });
    return 'انحذفت';
  }
  return 'أداة غير معروفة';
}

// ---------- request ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST only');

  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return fail(401, 'NOT_SIGNED_IN', 'سجّل دخول أولاً');

  let body: { text?: string; source?: string };
  try { body = await req.json(); } catch { return fail(400, 'BAD_REQUEST', 'الطلب غير صالح'); }
  const text = String(body.text ?? '').trim().slice(0, 2000);
  if (!text) return fail(400, 'EMPTY', 'ما وصلني كلام');
  const source = body.source === 'voice' ? 'voice' : 'text';

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fail(503, 'NOT_CONFIGURED', 'غيث مش مفعّل لسا (مفتاح Claude ناقص).');

  const now = new Date();
  const dayStart = new Date(now.getTime() - ((now.getTime() + TZ_OFFSET_H * 3600_000) % 86400_000));
  const { count } = await db.from('ghaith_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', dayStart.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) return fail(429, 'DAILY_LIMIT', 'وصلت الحد اليومي للرسائل، بنكمل بكرة.');

  const [{ data: open }, { data: history }, { data: settings }] = await Promise.all([
    db.from('ghaith_tasks').select(FIELDS).eq('status', 'open').order('due_at', { ascending: true, nullsFirst: false }).limit(120),
    db.from('ghaith_messages').select('role,content').order('id', { ascending: false }).limit(10),
    db.from('ghaith_settings').select('follow_up_days').maybeSingle(),
  ]);
  const { data: profile } = await db.from('profiles').select('display_name').eq('id', user.id).maybeSingle();

  // Earlier turns, oldest first, alternating and starting with the user
  const past: Msg[] = [];
  for (const m of (history ?? []).reverse() as { role: 'user' | 'assistant'; content: string }[]) {
    if (!past.length && m.role !== 'user') continue;
    const last = past[past.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${m.content}`;
    else past.push({ role: m.role, content: m.content });
  }
  if (past.length && past[past.length - 1].role === 'user') past.pop();

  const system = systemPrompt(now, (open ?? []) as Task[], settings?.follow_up_days ?? 3, (profile as { display_name?: string } | null)?.display_name ?? null);
  const messages: Msg[] = [...past, { role: 'user', content: text }];
  const actions: Action[] = [];
  let answer = '';

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await callClaude(apiKey, system, messages);
      const uses = res.content.filter((b) => b.type === 'tool_use');
      answer = res.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
      if (!uses.length || res.stop_reason !== 'tool_use') break;
      messages.push({ role: 'assistant', content: res.content as unknown as Record<string, unknown>[] });
      const results: Record<string, unknown>[] = [];
      for (const u of uses) {
        const out = await runTool(db, u.name!, u.input ?? {}, source, actions, now);
        results.push({ type: 'tool_result', tool_use_id: u.id, content: out, is_error: out.startsWith('خطأ') });
      }
      messages.push({ role: 'user', content: results });
      answer = '';
    }
  } catch (e) {
    console.error('[ghaith-agent]', String(e));
    if (!actions.length) return fail(502, 'UPSTREAM', 'ما قدرت أوصل لعقلي هالمرة، جرّب كمان شوي.');
  }

  if (!answer) answer = actions.length ? `تمام، ${actions.map((a) => a.title).join('، ')}.` : 'ما فهمت عليك منيح، عيدها بطريقة ثانية؟';
  answer = answer.replace(/[*#`_]/g, '').slice(0, 3900);

  await db.from('ghaith_messages').insert([
    { role: 'user', content: text },
    { role: 'assistant', content: answer, actions },
  ]);

  return reply(200, { reply: answer, actions, model: MODEL });
});
