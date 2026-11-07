// ghaith-capture: turns one capture (a voice recording's transcript, typed text, or a pasted email) into a list of
// proposed changes: new tasks, edits to existing ones, tasks to mark done, tasks to delete. Nothing is written here:
// the app shows the proposals for review and applies the ones the user keeps.
// The request runs as the signed-in user (row-level security applies to everything it reads).
//
// Body: { text, source: 'voice' | 'text' | 'email', lang: 'ar' | 'en' }
// Secrets: ANTHROPIC_API_KEY (required), GHAITH_MODEL (optional).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CAPTURE_FIELDS, CaptureTask, planCapture, TZ_OFFSET_H } from '../_shared/capture.ts';

const MODEL = Deno.env.get('GHAITH_MODEL') || 'claude-sonnet-5-5';
const DAILY_LIMIT = 200;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => reply(status, { error: code, message });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST only');

  let body: { text?: string; source?: string; lang?: string };
  try { body = await req.json(); } catch { return fail(400, 'BAD_REQUEST', 'Bad request'); }
  const lang = body.lang === 'en' ? 'en' : 'ar';
  const m = (ar: string, en: string) => (lang === 'en' ? en : ar);

  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!userData?.user) return fail(401, 'NOT_SIGNED_IN', m('يرجى تسجيل الدخول أولاً.', 'Please sign in first.'));

  const text = String(body.text ?? '').trim().slice(0, 6000);
  if (!text) return fail(400, 'EMPTY', m('لم يصل أي نص.', 'Nothing was received.'));
  const source = ['voice', 'text', 'email'].includes(String(body.source)) ? String(body.source) : 'text';

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fail(503, 'NOT_CONFIGURED', m('غيث غير مفعّل بعد.', 'Ghaith is not set up yet.'));

  const now = new Date();
  const dayStart = new Date(now.getTime() - ((now.getTime() + TZ_OFFSET_H * 3600_000) % 86400_000));
  const { count } = await db.from('ghaith_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', dayStart.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) return fail(429, 'DAILY_LIMIT', m('وصلت إلى الحد اليومي، نكمل غداً.', 'Daily limit reached, see you tomorrow.'));

  const [{ data: openData }, { data: settings }, { data: notes }] = await Promise.all([
    db.from('ghaith_tasks').select(CAPTURE_FIELDS).eq('status', 'open').order('created_at', { ascending: true }).limit(150),
    db.from('ghaith_settings').select('follow_up_days').maybeSingle(),
    db.from('ghaith_notes').select('fact').order('created_at').limit(80),
  ]);
  const open = (openData ?? []) as CaptureTask[];
  // Kept as a log of captures (also what the daily limit counts)
  await db.from('ghaith_messages').insert({ role: 'user', content: text.slice(0, 4000), actions: [] });
  const out = await planCapture({ apiKey, model: MODEL, text, source, lang, now, open, notes: ((notes ?? []) as { fact: string }[]).map((n) => n.fact), followUpDays: settings?.follow_up_days ?? 3 });
  if ('error' in out) return fail(502, 'UPSTREAM', m('تعذّر الترتيب هذه المرة، حاول بعد قليل.', 'Could not organise that right now, try again shortly.'));
  return reply(200, { actions: out.actions, source, model: MODEL });
});
