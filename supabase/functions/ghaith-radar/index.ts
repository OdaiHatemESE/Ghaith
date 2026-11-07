// ghaith-radar: the proactive scan. Looks at every open task, applies the Radar rules (_shared/radar.ts), and saves
// what needs attention in ghaith_nudges, without the user asking.
//
// Two ways in, one engine:
// - scheduled: pg_cron calls every 15 minutes with the header x-radar-key (a random key kept in Vault; checked by
//   ghaith_radar_key_ok). Scans all users with the service role.
// - manual ("check now" in the app, for demos): the signed-in user's own JWT. Scans only that user, through a client
//   that acts as them, so row-level security applies. At most once every 20 seconds per user.
//
// AI is used sparingly: only for new medium/high findings, one Claude call per user per run, titles/people/dates
// only (never notes). If the call fails the template text stays. Nothing is ever completed, postponed, deleted or
// sent anywhere by this function. Logs carry counts only, never task content.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { advicePrompt, AdviceInput, detect, Lang, localWhen, Nudge, RadarSettings, RadarTask, readAdvice, reconcile } from '../_shared/radar.ts';

const MODEL = Deno.env.get('GHAITH_RADAR_MODEL') || 'claude-haiku-5-5';
const AI_PER_RUN = 12; // findings sent to the AI per run, all users together
const AI_PER_USER = 6;
const MANUAL_GAP_MS = 20_000;
const TASK_FIELDS = 'id,user_id,title,kind,priority,person,due_at,remind_at,repeat,status,created_at,updated_at';
const NUDGE_FIELDS = 'id,user_id,task_id,risk_type,severity,score,fingerprint,status,detect_count,dismissed_at,acted_at,resolved_at';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Counts = { users_scanned: number; tasks_scanned: number; created: number; refreshed: number; reopened: number; resolved: number; ai_calls: number; ai_failed: number };
type Result = { counts: Counts; kept_dismissed: number };

async function scan(db: SupabaseClient, userId: string | null, now: Date): Promise<Result> {
  // 1. Open tasks (and, for the scope, the users they belong to)
  let q = db.from('ghaith_tasks').select(TASK_FIELDS).eq('status', 'open').limit(5000);
  if (userId) q = q.eq('user_id', userId);
  const { data: taskRows, error: taskErr } = await q;
  if (taskErr) throw new Error(`tasks: ${taskErr.code ?? ''}`);
  const tasks = (taskRows ?? []) as RadarTask[];

  // 2. Each user's follow-up days and language
  let sq = db.from('ghaith_settings').select('user_id,follow_up_days,lang');
  if (userId) sq = sq.eq('user_id', userId);
  const { data: settingRows } = await sq;
  const settings = new Map<string, RadarSettings>(((settingRows ?? []) as { user_id: string; follow_up_days: number; lang: Lang }[]).map((s) => [s.user_id, { follow_up_days: s.follow_up_days ?? 3, lang: s.lang === 'en' ? 'en' : 'ar' }]));

  // 3. What is already stored (every state, so dismissed findings are respected)
  let nq = db.from('ghaith_nudges').select(NUDGE_FIELDS).limit(20000);
  if (userId) nq = nq.eq('user_id', userId);
  const { data: nudgeRows, error: nudgeErr } = await nq;
  if (nudgeErr) throw new Error(`nudges: ${nudgeErr.code ?? ''}`);
  const existing = (nudgeRows ?? []) as Nudge[];

  // Scope = users with open tasks, plus users with active findings (whose tasks may all be closed now)
  const scope = new Set<string>(userId ? [userId] : [...tasks.map((t) => t.user_id), ...existing.filter((n) => n.status === 'new' || n.status === 'seen' || n.status === 'acted').map((n) => n.user_id)]);
  const findings = detect(tasks, settings, now);
  const plan = reconcile(existing, findings, new Set(tasks.map((t) => t.id)), scope, now);

  // 4. Save: inserts ignore a row a parallel run already made (unique task + risk type), updates are by id
  if (plan.inserts.length) {
    const rows = plan.inserts.map((f) => ({ ...f, first_detected_at: now.toISOString(), last_detected_at: now.toISOString() }));
    const { error } = await db.from('ghaith_nudges').upsert(rows, { onConflict: 'task_id,risk_type', ignoreDuplicates: true });
    if (error) throw new Error(`insert: ${error.code ?? ''}`);
  }
  for (const u of plan.updates) {
    const { error } = await db.from('ghaith_nudges').update(u.patch).eq('id', u.id);
    if (error) console.error('[radar] update failed', error.code);
  }

  // 5. Advice for new medium/high findings that don't have it yet
  const { kept_dismissed, ...changes } = plan.counts;
  const counts: Counts = { users_scanned: scope.size, tasks_scanned: tasks.length, ...changes, ai_calls: 0, ai_failed: 0 };
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  let pq = db.from('ghaith_nudges').select('id,user_id,task_id,risk_type,reason,lang').eq('ai_status', 'pending').eq('status', 'new').in('severity', ['medium', 'high']).order('score', { ascending: false }).limit(AI_PER_RUN);
  if (userId) pq = pq.eq('user_id', userId);
  const { data: pending } = await pq;
  if (!key || !pending?.length) return { counts, kept_dismissed };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const groups = new Map<string, typeof pending>();
  for (const p of pending) groups.set(p.user_id, [...(groups.get(p.user_id) ?? []), p].slice(0, AI_PER_USER));

  for (const [, list] of groups) {
    const lang: Lang = list[0].lang === 'en' ? 'en' : 'ar';
    const input: AdviceInput[] = list.flatMap((p) => {
      const t = byId.get(p.task_id);
      return t ? [{ id: p.id, title: t.title, kind: t.kind, person: t.person, priority: t.priority, due_local: localWhen(t.due_at, lang), risk_type: p.risk_type, reason: p.reason }] : [];
    });
    if (!input.length) continue;
    counts.ai_calls++;
    let advice = new Map<string, string>();
    try {
      const { system, tool } = advicePrompt(lang);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25_000);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 900, system, tools: [tool], messages: [{ role: 'user', content: JSON.stringify(input) }] }),
      });
      clearTimeout(timer);
      if (res.ok) advice = readAdvice((await res.json()).content, input.map((i) => i.id));
      else console.error('[radar] advice status', res.status);
    } catch (e) {
      console.error('[radar] advice failed', String(e).slice(0, 80));
    }
    for (const i of input) {
      const text = advice.get(i.id);
      if (!text) counts.ai_failed++;
      await db.from('ghaith_nudges').update(text ? { ai_recommendation: text, ai_status: 'done' } : { ai_status: 'failed' }).eq('id', i.id).eq('ai_status', 'pending');
    }
  }
  return { counts, kept_dismissed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'METHOD' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let mode: 'scheduled' | 'manual';
  let userId: string | null = null;
  let db: SupabaseClient;
  const radarKey = req.headers.get('x-radar-key');
  if (radarKey) {
    const { data: ok } = await admin.rpc('ghaith_radar_key_ok', { p_key: radarKey });
    if (ok !== true) return reply(401, { error: 'BAD_KEY' });
    mode = 'scheduled';
    db = admin;
  } else {
    const auth = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data } = await asUser.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (!data?.user) return reply(401, { error: 'NOT_SIGNED_IN' });
    userId = data.user.id;
    mode = 'manual';
    db = asUser;
  }

  const now = new Date();
  const { data: run } = await admin.from('ghaith_radar_runs').insert({ mode, user_id: userId, started_at: now.toISOString() }).select('id').single();
  if (mode === 'manual') {
    // Logged first, then counted: of two checks fired together, only the earlier one goes ahead
    const { data: recent } = await admin.from('ghaith_radar_runs').select('id').eq('mode', 'manual').eq('user_id', userId!).gte('started_at', new Date(now.getTime() - MANUAL_GAP_MS).toISOString()).order('id', { ascending: true });
    if (run && recent?.length && recent[0].id !== run.id) {
      await admin.from('ghaith_radar_runs').update({ finished_at: new Date().toISOString(), error: 'too_soon' }).eq('id', run.id);
      return reply(429, { error: 'TOO_SOON' });
    }
  }
  try {
    const { counts, kept_dismissed } = await scan(db, userId, now);
    if (run) await admin.from('ghaith_radar_runs').update({ ...counts, finished_at: new Date().toISOString() }).eq('id', run.id);
    console.log(`[radar] ${mode} ok`, JSON.stringify({ ...counts, kept_dismissed }));
    return reply(200, { ok: true, mode, ...counts, kept_dismissed });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 200);
    if (run) await admin.from('ghaith_radar_runs').update({ finished_at: new Date().toISOString(), error: msg }).eq('id', run.id);
    console.error(`[radar] ${mode} failed`, msg);
    return reply(500, { ok: false, error: 'SCAN_FAILED' });
  }
});
