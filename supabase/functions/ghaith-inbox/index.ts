// ghaith-inbox: emails sent (or forwarded) to Ghaith's address. The email provider (Postmark inbound) posts each
// message here as JSON, to /functions/v1/ghaith-inbox?key=<the ghaith_inbox_key secret in Vault>.
//
// - Whose is it: the sender's address must be linked to a Ghaith account and verified (ghaith_senders). Anything
//   else is ignored and nothing of it is stored.
// - Verifying an address: an email from that address containing its code (GH-XXXXXX) marks it verified.
// - Otherwise the capture engine (_shared/capture.ts, the same one the app uses) reads the email with the person's
//   open tasks, and its proposals are saved in ghaith_inbox. Nothing is added, changed or sent until the person
//   approves in the app.
//
// The webhook key lives in Vault (ghaith_inbox_key, made by the database, migration 0010) and is checked there.
// Secrets: ANTHROPIC_API_KEY, GHAITH_MODEL (optional).
// Answers 200 to everything it has handled or deliberately ignored, so the provider doesn't retry; 403 to a wrong key.
// Logs carry outcomes only, never addresses or content.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CAPTURE_FIELDS, CaptureTask, planCapture, TZ_OFFSET_H } from '../_shared/capture.ts';

const MODEL = Deno.env.get('GHAITH_MODEL') || 'claude-sonnet-5-5';
const DAILY_EMAILS = 40; // per person
const CODE = /\bGH-[0-9A-F]{6}\b/i;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const done = (outcome: string) => (console.log('[inbox]', outcome), json(200, { ok: true, outcome }));

/** Plain text from HTML, for emails that have no text part */
const fromHtml = (h: string) =>
  h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();

type Inbound = {
  From?: string; FromName?: string; FromFull?: { Email?: string; Name?: string };
  Subject?: string; MessageID?: string; TextBody?: string; HtmlBody?: string;
  Headers?: { Name?: string; Value?: string }[];
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'METHOD' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const key = new URL(req.url).searchParams.get('key') ?? '';
  const { data: keyOk, error: keyErr } = key.length >= 32 ? await admin.rpc('ghaith_inbox_key_ok', { p_key: key }) : { data: false, error: null };
  if (keyErr) return json(503, { error: 'NOT_READY' }); // the provider will retry
  if (keyOk !== true) return json(403, { error: 'BAD_KEY' });

  let m: Inbound;
  try { m = await req.json(); } catch { return json(400, { error: 'BAD_REQUEST' }); }
  const from = String(m.FromFull?.Email ?? m.From ?? '').trim().toLowerCase();
  const name = String(m.FromFull?.Name ?? m.FromName ?? '').trim().slice(0, 200) || null;
  const subject = String(m.Subject ?? '').trim().slice(0, 500);
  const text = (String(m.TextBody ?? '').trim() || fromHtml(String(m.HtmlBody ?? ''))).slice(0, 8000);
  const messageId = String(m.MessageID ?? '').slice(0, 300) || `${from}|${subject}|${text.length}`;
  if (!from.includes('@')) return done('no_sender');

  // Mail the provider marks as spam, or whose sender check failed, is never acted on
  const header = (n: string) => (m.Headers ?? []).find((h) => (h.Name ?? '').toLowerCase() === n.toLowerCase())?.Value ?? '';
  if (/^yes/i.test(header('X-Spam-Status')) || /SPF_FAIL/i.test(header('X-Spam-Tests'))) return done('spam');

  // 1. Verifying an address: its code anywhere in the subject or the text
  const code = CODE.exec(`${subject}\n${text}`)?.[0]?.toUpperCase();
  if (code) {
    const { data: row } = await admin.from('ghaith_senders').select('id,user_id,verified_at').eq('email', from).eq('code', code).maybeSingle();
    if (row) {
      if (!row.verified_at) {
        const { error } = await admin.from('ghaith_senders').update({ verified_at: new Date().toISOString() }).eq('id', row.id).is('verified_at', null);
        if (error) return done('verify_conflict'); // already verified by another account (unique index)
      }
      await admin.from('ghaith_inbox').upsert({ user_id: row.user_id, message_id: messageId, kind: 'verify', sender: from, sender_name: name, subject, status: 'done' }, { onConflict: 'user_id,message_id', ignoreDuplicates: true });
      return done('verified');
    }
  }

  // 2. Whose email is it
  const { data: sender } = await admin.from('ghaith_senders').select('user_id').eq('email', from).not('verified_at', 'is', null).maybeSingle();
  if (!sender) return done('unknown_sender');
  const userId: string = sender.user_id;

  // 3. Store it once (the provider retries), within the daily limit
  const now = new Date();
  const dayStart = new Date(now.getTime() - ((now.getTime() + TZ_OFFSET_H * 3600_000) % 86400_000));
  const { count } = await admin.from('ghaith_inbox').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'email').gte('received_at', dayStart.toISOString());
  if ((count ?? 0) >= DAILY_EMAILS) return done('daily_limit');
  const excerpt = text.slice(0, 1500);
  const { data: inserted, error: insErr } = await admin.from('ghaith_inbox')
    .upsert({ user_id: userId, message_id: messageId, kind: 'email', sender: from, sender_name: name, subject, excerpt, status: 'pending' }, { onConflict: 'user_id,message_id', ignoreDuplicates: true })
    .select('id');
  if (insErr) return json(500, { error: 'STORE' }); // the provider will retry
  if (!inserted?.length) return done('duplicate');
  const itemId = inserted[0].id;

  // 4. What Ghaith proposes from it: the same engine as capture in the app, with this person's open tasks
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const fail = async (why: string) => (await admin.from('ghaith_inbox').update({ status: 'failed', error: why }).eq('id', itemId), done(`failed_${why}`));
  if (!apiKey) return await fail('not_configured');
  const [{ data: openData }, { data: settings }, { data: notes }] = await Promise.all([
    admin.from('ghaith_tasks').select(CAPTURE_FIELDS).eq('user_id', userId).eq('status', 'open').order('created_at', { ascending: true }).limit(150),
    admin.from('ghaith_settings').select('follow_up_days,lang').eq('user_id', userId).maybeSingle(),
    admin.from('ghaith_notes').select('fact').eq('user_id', userId).order('created_at').limit(80),
  ]);
  const lang = settings?.lang === 'en' ? 'en' : 'ar';
  const content = `From: ${name ? `${name} <${from}>` : from}\nSubject: ${subject || '(none)'}\n\n${text || '(empty)'}`;
  const out = await planCapture({
    apiKey, model: MODEL, text: content, source: 'email', lang, now,
    open: (openData ?? []) as CaptureTask[],
    notes: ((notes ?? []) as { fact: string }[]).map((n) => n.fact),
    followUpDays: settings?.follow_up_days ?? 3,
  });
  if ('error' in out) return await fail('ai');
  const { error: upErr } = await admin.from('ghaith_inbox').update({ proposals: out.actions }).eq('id', itemId);
  if (upErr) return await fail('save');
  // Counted with the person's other requests to Ghaith (the daily limits read this log)
  await admin.from('ghaith_messages').insert({ user_id: userId, role: 'user', content: `[email] ${subject}`.slice(0, 300), actions: [] });
  return done(`proposed_${out.actions.length}`);
});
