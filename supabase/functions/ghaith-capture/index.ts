// ghaith-capture: turns one capture (a voice recording's transcript, typed text, or later a forwarded email) into a
// list of draft tasks. Nothing is saved here: the app shows the drafts for review and saves the ones the user keeps.
// The request runs as the signed-in user (row-level security applies to everything it reads).
//
// Secrets: ANTHROPIC_API_KEY (required), GHAITH_MODEL (optional).
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = Deno.env.get('GHAITH_MODEL') || 'claude-sonnet-5-5';
const DAILY_LIMIT = 200;
const TZ_OFFSET_H = 4; // Asia/Dubai, no daylight saving

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => reply(status, { error: code, message });

// ---------- time (the model works in Dubai local time) ----------
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
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
    const label = i === 0 ? ' (اليوم)' : i === 1 ? ' (بكرة)' : i === 2 ? ' (بعد بكرة)' : '';
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

const TOOL = {
  name: 'draft_tasks',
  description: 'يرجّع قائمة المهام المستخرجة من كلام المستخدم، مهمة لكل شغلة مستقلة.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'عنوان قصير بصيغة فعل يميّز المهمة: الفعل + الموضوع + الجهة/الشخص، مثل "الرد على إيميل خالد بخصوص العقد"' },
            kind: { type: 'string', enum: KINDS, description: 'todo = شغلة عليّ أعملها. waiting = طلبت من حدا وناطر رده أو تسليمه. reply = حدا بعتلي ولازم أرد عليه' },
            category: { type: 'string', enum: CATS, description: 'work عمل، home بيت، car سيارة، family عائلة/أولاد، personal شخصي/مواعيد خاصة، money فواتير/دفعات، other' },
            priority: { type: 'string', enum: ['high', 'normal', 'low'] },
            person: { type: ['string', 'null'], description: 'الشخص أو الجهة المرتبطة إن ذُكرت' },
            due_at: { type: ['string', 'null'], description: 'الموعد النهائي بتوقيت دبي YYYY-MM-DDTHH:MM أو null' },
            remind_at: { type: ['string', 'null'], description: 'وقت التذكير بتوقيت دبي YYYY-MM-DDTHH:MM أو null إذا ما في أي إشارة لوقت' },
            repeat: { type: ['string', 'null'], enum: ['daily', 'weekly', 'monthly', 'yearly', null] },
            notes: { type: ['string', 'null'], description: 'تفاصيل مفيدة قالها (أرقام، المطلوب بالضبط). لا تكرر العنوان' },
            similar_to: { type: ['string', 'null'], description: 'إذا المهمة شبه أكيد نفس مهمة مفتوحة موجودة بالقائمة: عنوان المهمة الموجودة. غير هيك null' },
          },
          required: ['title', 'kind', 'category', 'priority'],
        },
      },
    },
    required: ['tasks'],
  },
};

function systemPrompt(now: Date, followUpDays: number, open: string[], notes: string[], source: string): string {
  return `أنت "غيث"، مساعد بيرتّب المهام لموظف إداري بجهة حكومية بالإمارات. بيعطيك دفعة وحدة من الكلام (${source === 'voice' ? 'تسجيل صوتي محوّل لنص، فيه ممكن أخطاء تحويل: افهم المقصود' : source === 'email' ? 'نص إيميل وصله' : 'نص كتبه'})، وشغلتك تقسّمها لقائمة مهام واضحة عبر الأداة draft_tasks. ما في محادثة ولا رد: فقط القائمة.

الوقت الآن: ${localIso(now)} يوم ${weekday(now)} (توقيت دبي). الويك إند السبت والأحد.
${calendar(now)}

مهامه المفتوحة حالياً (للمقارنة فقط):
${open.length ? open.map((t) => '- ' + t).join('\n') : '(ما في)'}

شو بتعرف عنه:
${notes.length ? notes.map((n) => '- ' + n).join('\n') : '(ما في)'}

القواعد:
- كل شغلة مستقلة = مهمة لحالها. لا تدمج شغلتين بمهمة، ولا تقسم شغلة وحدة لمهمتين.
- تجاهل الكلام اللي مش مهمة (تحيات، تفكير بصوت عالي، "يعني"، "خلص هيك").
- العنوان عربي واضح ومختصر، بدون كلمات زي "ذكرني" أو "لازم".
- النوع: "لازم أعمل/أجهّز/أخلّص" = todo. "بعتت لفلان وناطر / طلبت من / فلان رح يبعتلي" = waiting. "فلان بعتلي / لازم أرد على" = reply.
- التصنيف من السياق: المدير، الاجتماع، تقرير، إيميل شغل، جهة = work. تأمين/ملكية/صيانة/مخالفة = car. فاتورة/دفعة = money. إذا مش واضح والكلام عن إيميل أو شخص بالشغل = work.
- الأولوية high فقط إذا قال مستعجل/ضروري/مهم، أو شغلة شغل موعدها اليوم أو بكرة.
- الأوقات بتوقيت دبي:
  • "الصبح" 09:00، "الظهر" 13:00، "العصر" 16:00، "المسا" 19:00، "الليل" 21:00.
  • "بكرة" اليوم التالي. "آخر الأسبوع" الجمعة. "الأسبوع الجاي" الاثنين الجاي. "آخر الشهر" آخر يوم بالشهر.
  • موعد بيوم بدون ساعة: due_at 17:00 بذاك اليوم، و remind_at 09:00 بنفس اليوم.
  • موعد مع ساعة: remind_at قبله بساعة، إلا إذا حدد هو وقت التذكير.
  • waiting بدون موعد: remind_at متابعة بعد ${followUpDays} أيام الساعة 10:00.
  • reply بدون موعد: remind_at بكرة 09:00 (أو بعد ساعتين إذا الوقت الآن بالدوام).
  • todo بدون أي إشارة لوقت: due_at و remind_at = null (المستخدم بيختار وقت بالمراجعة).
  • "قبل الاجتماع" أو "قبل يوم كذا": due_at قبل ذاك الموعد، remind_at 09:00 بيوم قبله.
  • لا تحط وقت بالماضي.
- similar_to: فقط إذا المهمة تقريباً أكيد نفسها مهمة مفتوحة موجودة (نفس الشغلة ونفس الشخص/الجهة). تشابه الكلمات لحاله مش كافي.
- استدعِ draft_tasks دائماً مرة وحدة، بدون أي نص قبلها أو بعدها. إذا ما في ولا مهمة بالكلام، استدعها بقائمة فاضية.`;
}

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
  if (!userData?.user) return fail(401, 'NOT_SIGNED_IN', 'سجّل دخول أولاً');

  let body: { text?: string; source?: string };
  try { body = await req.json(); } catch { return fail(400, 'BAD_REQUEST', 'الطلب غير صالح'); }
  const text = String(body.text ?? '').trim().slice(0, 6000);
  if (!text) return fail(400, 'EMPTY', 'ما وصلني كلام');
  const source = ['voice', 'text', 'email'].includes(String(body.source)) ? String(body.source) : 'text';

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fail(503, 'NOT_CONFIGURED', 'غيث مش مفعّل لسا (مفتاح Claude ناقص).');

  const now = new Date();
  const dayStart = new Date(now.getTime() - ((now.getTime() + TZ_OFFSET_H * 3600_000) % 86400_000));
  const { count } = await db.from('ghaith_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', dayStart.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) return fail(429, 'DAILY_LIMIT', 'وصلت الحد اليومي، بنكمل بكرة.');

  const [{ data: open }, { data: settings }, { data: notes }] = await Promise.all([
    db.from('ghaith_tasks').select('title,person').eq('status', 'open').order('created_at', { ascending: false }).limit(120),
    db.from('ghaith_settings').select('follow_up_days').maybeSingle(),
    db.from('ghaith_notes').select('fact').order('created_at').limit(80),
  ]);
  // Kept as a log of captures (also what the daily limit counts)
  await db.from('ghaith_messages').insert({ role: 'user', content: text.slice(0, 4000), actions: [] });

  const system = systemPrompt(
    now,
    settings?.follow_up_days ?? 3,
    ((open ?? []) as { title: string; person: string | null }[]).map((t) => t.title + (t.person ? ` (${t.person})` : '')),
    ((notes ?? []) as { fact: string }[]).map((n) => n.fact),
    source,
  );

  let input: { tasks?: Record<string, unknown>[] } | null = null;
  for (let attempt = 0; attempt < 2 && !input; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, system, tools: [TOOL], messages: [{ role: 'user', content: text }] }),
    });
    if (!res.ok) {
      console.error('[ghaith-capture] Claude', res.status, (await res.text()).slice(0, 300));
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      return fail(502, 'UPSTREAM', 'ما قدرت أرتّبها هالمرة، جرّب كمان شوي.');
    }
    const out = await res.json();
    const use = (out.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
    input = use?.input ?? { tasks: [] };
  }

  const soon = new Date(now.getTime() + 30 * 60_000).toISOString();
  const tasks = (input?.tasks ?? []).slice(0, 25).map((t) => {
    const remind = parseWhen(t.remind_at);
    return {
      title: String(t.title ?? '').trim().slice(0, 300),
      kind: KINDS.includes(String(t.kind)) ? t.kind : 'todo',
      category: CATS.includes(String(t.category)) ? t.category : 'other',
      priority: ['high', 'normal', 'low'].includes(String(t.priority)) ? t.priority : 'normal',
      person: t.person ? String(t.person).slice(0, 120) : null,
      due_at: parseWhen(t.due_at),
      remind_at: remind && remind < now.toISOString() ? soon : remind,
      repeat: ['daily', 'weekly', 'monthly', 'yearly'].includes(String(t.repeat)) ? t.repeat : null,
      notes: t.notes ? String(t.notes).slice(0, 2000) : null,
      similar_to: t.similar_to ? String(t.similar_to).slice(0, 300) : null,
    };
  }).filter((t) => t.title);

  return reply(200, { tasks, source, model: MODEL });
});
