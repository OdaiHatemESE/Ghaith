// ghaith-agent: the chat with غيث. Takes a message (typed or dictated), lets Claude act on the user's tasks through
// tools (add, update, complete, delete, search, remember) and returns a short reply in formal Arabic or English.
// Every database call goes through a client that acts as the signed-in user, so row-level security applies.
//
// Body: { text, source: 'voice' | 'text', lang: 'ar' | 'en', since?: ISO time the current conversation started,
//        mode?: 'voice' (the voice conversation: the reply is read aloud, so it is kept short and spoken) }
// Secrets: ANTHROPIC_API_KEY (required), GHAITH_MODEL (optional, default below).
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

const MODEL = Deno.env.get('GHAITH_MODEL') || 'claude-sonnet-5-5';
const MAX_STEPS = 8;
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
const CAT_AR: Record<string, string> = { work: 'عمل', meeting: 'عمل/اجتماع', email: 'عمل/بريد', report: 'عمل/تقرير', home: 'شخصي/بيت', car: 'شخصي/سيارة', family: 'شخصي/عائلة', personal: 'شخصي', money: 'شخصي/فلوس', other: 'شخصي/أخرى' };
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
  category: { type: 'string', enum: Object.keys(CAT_AR), description: 'العمل: meeting اجتماع/ورشة/عرض، email رد أو إرسال بريد أو كتاب رسمي، report تقرير/دراسة/ملف، work أي عمل آخر (المدير، الزملاء، الجهات، المشاريع). الشخصي: car سيارة، home بيت، family عائلة/أولاد، money فواتير/دفعات/بنك، personal صحة/مواعيد خاصة، other' },
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
    name: 'remember',
    description: 'يحفظ معلومة ثابتة عن المستخدم أو شغله (مديره، الجهات، المشاريع، الفريق) لتفهمه أحسن بالمحادثات الجاية.',
    input_schema: { type: 'object', properties: { fact: { type: 'string', description: 'جملة قصيرة، مثل: مديره اسمه خالد' } }, required: ['fact'] },
  },
  {
    name: 'forget',
    description: 'يحذف معلومة محفوظة إذا طلب أو إذا صارت غلط.',
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

function systemPrompt(now: Date, open: Task[], followUpDays: number, name: string | null, notes: { id: string; fact: string }[], lang: string, spoken = false): string {
  const list = open.length ? open.map((t) => '- ' + describe(t, now)).join('\n') : '(ما في مهام مفتوحة)';
  const known = notes.length ? notes.map((n) => `- [${n.id.slice(0, 8)}] ${n.fact}`).join('\n') : '(لسا ما في)';
  return `أنت "غيث"، السكرتير والمساعد الشخصي${name ? ` لـ ${name}` : ''}. هو موظف إداري بجهة حكومية بالإمارات، عنده إيميلات ومهام كثيرة وبينسى. شغلتك تدير مهامه: تسجّلها، تصنّفها، تذكّره فيها، وتتابع معه لحد ما تخلص. غالباً بيحكي معك بالصوت وهو سايق أو ماشي، فالنص اللي بيوصلك تحويل صوت لنص وممكن فيه أخطاء إملائية بسيطة: افهم المقصود.

الوقت الآن: ${localIso(now)} يوم ${weekday(now)} (توقيت دبي). الويك إند بالإمارات السبت والأحد.
التقويم للأيام الجاية:
${calendar(now)}

المهام المفتوحة حالياً (الأحدث إضافةً آخر وحدة بتاريخ الإضافة):
${list}

شو بتعرف عنه (من محادثات سابقة):
${known}

كيف تشتغل:
- نفّذ مباشرة بالأدوات وخبّره شو عملت. لا تسأل "بدك أضيفها؟".
- جملة وحدة ممكن يكون فيها أكثر من مهمة أو أمر: نفّذهم كلهم، وكل شغلة مستقلة مهمة لحالها.

إضافة ولا تعديل؟ (أهم قاعدة)
- الأصل إنه كل طلب جديد = مهمة جديدة (add_tasks). عنده مهام كثيرة متشابهة بالشكل ومختلفة بالموضوع (رد على إيميل جهة، رد على إيميل جهة ثانية، رد على إيميل المدير...). تشابه العنوان أو الكلمات مش سبب أبداً لتعديل مهمة موجودة أو دمجها.
- "ضيف/سجّل/ذكّرني/عندي/لازم/مهمة جديدة/كمان" = إضافة جديدة دائماً، حتى لو في مهمة بعنوان مشابه.
- التعديل (update/complete/delete) فقط لما يكون واضح إنه بيقصد مهمة موجودة بعينها: بيستخدم فعل تعديل (أجّل، غيّر، عدّل، انقل، خلصت، انعملت، الغي، احذف، فلان رد) + تفاصيل بتحددها (الجهة، الشخص، الموضوع، أو "هاي اللي ضفتها هلأ").
- إذا قال فعل تعديل وفي أكثر من مهمة ممكن يقصدها ("خلصت رد الإيميل" وعنده ثلاث إيميلات): لا تخمّن، اسأله "أي واحد؟" واذكر الخيارات باختصار.
- لا تدمج مهمتين، ولا تغيّر عنوان مهمة لتضيف عليها شغلة ثانية.

عناوين واضحة:
- العنوان لازم يميّز المهمة عن غيرها: الفعل + الموضوع + الجهة/الشخص، مثل "الرد على إيميل وزارة المالية بخصوص الميزانية" مش "رد إيميل".
- إذا الطلب ناقص تفصيلة مهمة (رد على إيميل مين؟ عن شو؟): أضف المهمة بالمعلومات الموجودة بعنوان طبيعي (مثل "الرد على إيميل")، وبنفس الرد اسأل سؤال واحد قصير لتكملها.
- جواب على سؤالك مش طلب جديد: إذا آخر رد إلك كان سؤال عن تفاصيل مهمة ضفتها (رقمها مكتوب بسطر "اللي عملته")، ورسالته الحالية بتجاوب عليه، اعمل update_task لنفس المهمة (العنوان والشخص والتفاصيل)، ولا تضيف مهمة ثانية. إذا رسالته فيها كمان طلبات جديدة، نفّذها هي كمان.

ذاكرتك عنه:
- إذا ذكر معلومة ثابتة بتفيدك تفهمه بعدين (مين مديره، الجهات اللي بيتعامل معها، أسماء مشاريعه، فريقه، دوامه)، احفظها بـ remember بجملة قصيرة. لا تحفظ مهام ولا مواعيد ولا أشياء مؤقتة ولا معلومات حساسة (صحة، فلوس شخصية).
- استخدم المعلومات المحفوظة لتفهم كلامه وتختار الجهة والتصنيف الصح.

التصنيف والأوقات:
- النوع: "لازم أعمل/أخلّص/أجهّز" = todo. "بعتت لفلان وناطر/طلبت من/فلان رح يبعتلي" = waiting. "فلان بعتلي/وصلني إيميل/لازم أرد على" = reply.
- التصنيف: قرّر أولاً هل هي عمل أم شخصي، ثم الأدق. عمل: اجتماع/ورشة/عرض = meeting، رد أو إرسال إيميل أو كتاب رسمي = email، تقرير/دراسة/ملف = report، غير ذلك من الشغل (المدير، الزملاء، الجهات، البوابة، المشاريع) = work. شخصي: تأمين/تسجيل/صيانة/مخالفة سيارة = car؛ فواتير/دفعات/بنك = money؛ أغراض/تصليح البيت = home؛ الأولاد/المدرسة/الأهل = family؛ صحة/مواعيد خاصة = personal. اتبع المعلومات المحفوظة إن ذكرت كيف يصنّف شيئاً. إذا مش واضح وكان الكلام عن إيميل أو شخص بالشغل فهو عمل.
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

اللغة والصياغة:
${lang === 'en'
  ? '- Reply in clear, concise English. Write task titles and notes in English.'
  : '- ردّ بالعربية الفصحى المبسّطة والمهذّبة، حتى لو كتب المستخدم بالعامية. واكتب عناوين المهام والملاحظات بالفصحى المرتّبة (مثل: "الرد على بريد وزارة المالية بشأن الميزانية").'}

الرد:
${spoken
  ? `- هذه محادثة صوتية: ردّك سيُقرأ بصوت عالٍ فوراً، فكل كلمة زائدة تأخير. ردّ بجملة واحدة قصيرة، وجملتين كحد أقصى (أقل من 30 كلمة).
- لا قوائم ولا رموز ولا أقواس. عند السؤال عن المهام اذكر العدد وأهم مهمتين أو ثلاث في جملة واحدة متصلة، ثم اسأل إن كان يريد البقية.
- للتنفيذ قل ما فعلته بكلمات قليلة (مثل: "تم، ذكّرتك غداً الساعة التاسعة صباحاً").`
  : `- هذه محادثة مكتوبة على الشاشة: ردّ باختصار ووضوح. جملة أو جملتان للتنفيذ، وقائمة قصيرة عند السؤال عن المهام.
- للقوائم استخدم سطراً لكل بند يبدأ بـ "- "، ولا تستخدم نجوماً أو عناوين أو إيموجي.`}
- اذكر الأوقات بشكل طبيعي (غداً الساعة 9:00 صباحاً، الأحد القادم) لا بصيغة ISO، ولا تذكر أرقام المهام.
- إذا لم يكن هناك ما يُنفَّذ (تحية، شكر)، ردّ بلطف وباختصار.`;
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

  if (name === 'remember') {
    const fact = String(input.fact ?? '').trim().slice(0, 400);
    if (fact.length < 2) return 'خطأ: المعلومة فاضية';
    const { error } = await db.from('ghaith_notes').insert({ fact });
    return error ? `خطأ: ${error.message}` : 'انحفظت';
  }
  if (name === 'forget') {
    const short = String(input.id ?? '').replace(/[^0-9a-f-]/gi, '').toLowerCase();
    const { data } = await db.from('ghaith_notes').select('id');
    const hit = (data as { id: string }[] | null)?.find((n) => short.length >= 6 && n.id.startsWith(short));
    if (!hit) return 'خطأ: ما لقيت المعلومة';
    await db.from('ghaith_notes').delete().eq('id', hit.id);
    return 'انحذفت';
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

  let body: { text?: string; source?: string; lang?: string; since?: string; mode?: string };
  try { body = await req.json(); } catch { return fail(400, 'BAD_REQUEST', 'الطلب غير صالح'); }
  const text = String(body.text ?? '').trim().slice(0, 2000);
  if (!text) return fail(400, 'EMPTY', 'ما وصلني كلام');
  const source = body.source === 'voice' ? 'voice' : 'text';
  const lang = body.lang === 'en' ? 'en' : 'ar';
  // The conversation the user is in: from `since` (when they started a new chat), at most the last 12 hours
  const floor = new Date(Date.now() - 12 * 3600_000);
  const sinceDate = body.since && !isNaN(new Date(body.since).getTime()) && new Date(body.since) > floor ? new Date(body.since) : floor;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fail(503, 'NOT_CONFIGURED', 'غيث مش مفعّل لسا (مفتاح Claude ناقص).');

  const now = new Date();
  const dayStart = new Date(now.getTime() - ((now.getTime() + TZ_OFFSET_H * 3600_000) % 86400_000));
  const { count } = await db.from('ghaith_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', dayStart.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) return fail(429, 'DAILY_LIMIT', 'وصلت الحد اليومي للرسائل، بنكمل بكرة.');

  const [{ data: open }, { data: history }, { data: settings }, { data: notes }, { data: profile }] = await Promise.all([
    db.from('ghaith_tasks').select(FIELDS).eq('status', 'open').order('created_at', { ascending: true }).limit(150),
    // Only chat turns: captures from the capture screen are logged in the same table without the chat marker
    db.from('ghaith_messages').select('role,content,actions').or('role.eq.assistant,actions.cs.[{"type":"chat"}]').gte('created_at', sinceDate.toISOString()).order('id', { ascending: false }).limit(12),
    db.from('ghaith_settings').select('follow_up_days').maybeSingle(),
    db.from('ghaith_notes').select('id,fact').order('created_at').limit(80),
    db.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);

  // Earlier turns, oldest first, alternating and starting with the user
  const past: Msg[] = [];
  for (const m of (history ?? []).reverse() as { role: 'user' | 'assistant'; content: string; actions?: Action[] }[]) {
    if (!past.length && m.role !== 'user') continue;
    const did = m.role === 'assistant' && m.actions?.length ? `\n(اللي عملته: ${m.actions.map((a) => `${a.type} [${a.id.slice(0, 8)}] ${a.title}`).join('؛ ')})` : '';
    const content = m.content + did;
    const last = past[past.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${content}`;
    else past.push({ role: m.role, content });
  }
  if (past.length && past[past.length - 1].role === 'user') past.pop();

  const system = systemPrompt(now, (open ?? []) as Task[], settings?.follow_up_days ?? 3, (profile as { display_name?: string } | null)?.display_name ?? null, (notes ?? []) as { id: string; fact: string }[], lang, body.mode === 'voice');
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
    if (!actions.length) return fail(502, 'UPSTREAM', lang === 'en' ? 'Could not reach Ghaith right now, please try again shortly.' : 'تعذّر الوصول إلى غيث هذه المرة، حاول بعد قليل.');
  }

  if (!answer) answer = actions.length ? (lang === 'en' ? `Done: ${actions.map((a) => a.title).join(', ')}.` : `تم: ${actions.map((a) => a.title).join('، ')}.`) : lang === 'en' ? 'I did not quite get that, could you say it another way?' : 'لم أفهم الطلب جيداً، هل يمكنك صياغته بطريقة أخرى؟';
  const end = answer.includes('[END]');
  answer = answer.replace('[END]', '').replace(/[*#`]/g, '').trim().slice(0, 3900);

  await db.from('ghaith_messages').insert([
    { role: 'user', content: text, actions: [{ type: 'chat' }] },
    { role: 'assistant', content: answer, actions },
  ]);

  return reply(200, { reply: answer, actions, end, model: MODEL });
});
