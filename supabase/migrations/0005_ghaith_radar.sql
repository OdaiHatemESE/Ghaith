-- Ghaith Radar: proactive findings about open tasks, found by a scheduled server scan.
-- Additive only: two new tables, one new settings column, three small functions, one Vault secret, pg_cron enabled.
-- Nothing existing is altered or dropped. A copy of Ghaith's tables is kept first (schema ghaith_backup_20261107,
-- not exposed through the API) in case anything needs to be compared or restored.

-- 0. Backup copy (data only, no API access)
create schema if not exists ghaith_backup_20261107;
revoke all on schema ghaith_backup_20261107 from public, anon, authenticated;
create table if not exists ghaith_backup_20261107.ghaith_tasks as table public.ghaith_tasks;
create table if not exists ghaith_backup_20261107.ghaith_settings as table public.ghaith_settings;
create table if not exists ghaith_backup_20261107.ghaith_notes as table public.ghaith_notes;
create table if not exists ghaith_backup_20261107.ghaith_messages as table public.ghaith_messages;

-- 1. The user's language, so findings and advice are written in it
alter table public.ghaith_settings add column if not exists lang text not null default 'ar' check (lang in ('ar', 'en'));

-- 2. Findings
create table if not exists public.ghaith_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.ghaith_tasks (id) on delete cascade,
  risk_type text not null check (risk_type in ('overdue', 'reply_pending', 'waiting_followup', 'due_soon', 'stale')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  score smallint not null check (score between 0 and 100),
  reason text not null check (char_length(reason) <= 600),
  recommendation text not null check (char_length(recommendation) <= 600),
  facts jsonb not null default '{}'::jsonb,
  fingerprint text not null check (char_length(fingerprint) <= 300),
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  ai_recommendation text check (char_length(ai_recommendation) <= 600),
  ai_status text not null default 'pending' check (ai_status in ('pending', 'done', 'failed', 'skipped')),
  status text not null default 'new' check (status in ('new', 'seen', 'dismissed', 'acted', 'resolved')),
  resolved_reason text check (char_length(resolved_reason) <= 60),
  detect_count integer not null default 1,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  notify_after timestamptz not null default now(),
  seen_at timestamptz,
  dismissed_at timestamptz,
  acted_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  -- one row per task and risk type: the scan updates it instead of adding duplicates, even if two scans overlap
  constraint ghaith_nudges_task_risk_key unique (task_id, risk_type)
);
create index if not exists ghaith_nudges_user_status_idx on public.ghaith_nudges (user_id, status, score desc);

alter table public.ghaith_nudges enable row level security;
-- People read and update (seen / dismissed / acted) only their own findings
create policy ghaith_nudges_select on public.ghaith_nudges for select to authenticated using (user_id = (select auth.uid()));
create policy ghaith_nudges_update on public.ghaith_nudges for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- A manual check ("check now") writes findings as the signed-in person, only for their own tasks
create policy ghaith_nudges_insert on public.ghaith_nudges for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.ghaith_tasks t where t.id = task_id and t.user_id = (select auth.uid())));

create or replace function public.ghaith_nudges_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ghaith_nudges_touch on public.ghaith_nudges;
create trigger ghaith_nudges_touch before update on public.ghaith_nudges for each row execute function public.ghaith_nudges_touch();

-- 3. A log of every scan (no task content): proof that the schedule runs, and what each run did
create table if not exists public.ghaith_radar_runs (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('scheduled', 'manual')),
  user_id uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  users_scanned integer,
  tasks_scanned integer,
  created integer,
  refreshed integer,
  reopened integer,
  resolved integer,
  ai_calls integer,
  ai_failed integer,
  error text check (char_length(error) <= 300)
);
create index if not exists ghaith_radar_runs_mode_idx on public.ghaith_radar_runs (mode, started_at desc);
create index if not exists ghaith_radar_runs_user_idx on public.ghaith_radar_runs (user_id, started_at desc);
alter table public.ghaith_radar_runs enable row level security; -- no policies: only the server writes or reads it

-- When the last scheduled scan finished (a time only, nothing about anyone's tasks)
create or replace function public.ghaith_radar_status() returns table (last_scheduled_at timestamptz, ok boolean)
language sql stable security definer set search_path = '' as $$
  select r.finished_at, r.error is null from public.ghaith_radar_runs r
  where r.mode = 'scheduled' and r.finished_at is not null order by r.started_at desc limit 1
$$;
revoke all on function public.ghaith_radar_status() from public, anon;
grant execute on function public.ghaith_radar_status() to authenticated;

-- 4. The key the scheduler presents to ghaith-radar. Made here at random, kept in Vault, never written anywhere else.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ghaith_radar_key') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'ghaith_radar_key', 'pg_cron -> ghaith-radar');
  end if;
end $$;

-- Only the server (service role) may check a key; it never returns the key itself
create or replace function public.ghaith_radar_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_key, '') <> '' and exists (select 1 from vault.decrypted_secrets where name = 'ghaith_radar_key' and decrypted_secret = p_key)
$$;
revoke all on function public.ghaith_radar_key_ok(text) from public, anon, authenticated;
grant execute on function public.ghaith_radar_key_ok(text) to service_role;

-- 5. The scheduler itself (the job is added in 0006, once the function is deployed and tested)
create extension if not exists pg_cron with schema pg_catalog;
