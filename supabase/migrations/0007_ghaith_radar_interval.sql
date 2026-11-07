-- Ghaith Radar: each person chooses how often the automatic check runs (default every 8 hours, or off).
-- Additive only: two new columns on ghaith_settings, and the existing pg_cron job moves from every 15 minutes to
-- hourly. Each hourly run checks only the people whose own interval has passed (see ghaith-radar).
alter table public.ghaith_settings add column if not exists radar_every_hours smallint not null default 8
  check (radar_every_hours in (0, 2, 4, 8, 12, 24)); -- 0 = automatic check off ("check now" still works)
alter table public.ghaith_settings add column if not exists radar_checked_at timestamptz; -- last automatic check, written by the server

select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'ghaith-radar'), schedule := '5 * * * *');
