-- Meeting minutes: the person writes the meeting's title and its points as they come; Ghaith organises them into
-- minutes (summary, topics, decisions, open questions) and proposes the actions as tasks. Tasks made from a
-- meeting keep a link to it (meeting_id), so the minutes show how their actions are going.

create table if not exists public.ghaith_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  held_at timestamptz not null default now(),
  attendees text check (char_length(attendees) <= 1000),
  -- [{ "id": "…", "text": "…" }], in the order written
  points jsonb not null default '[]'::jsonb check (jsonb_typeof(points) = 'array' and pg_column_size(points) < 64000),
  -- what Ghaith organised (written by the ghaith-minutes function, as the person)
  minutes jsonb check (minutes is null or pg_column_size(minutes) < 64000),
  organized_at timestamptz,
  actions_added_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ghaith_meetings_user_idx on public.ghaith_meetings (user_id, held_at desc);

alter table public.ghaith_meetings enable row level security;
create policy ghaith_meetings_select on public.ghaith_meetings for select to authenticated using (user_id = (select auth.uid()));
create policy ghaith_meetings_insert on public.ghaith_meetings for insert to authenticated with check (user_id = (select auth.uid()));
create policy ghaith_meetings_update on public.ghaith_meetings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ghaith_meetings_delete on public.ghaith_meetings for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.ghaith_meetings from anon;

drop trigger if exists ghaith_meetings_touch on public.ghaith_meetings;
create trigger ghaith_meetings_touch before update on public.ghaith_meetings
  for each row execute function public.ghaith_touch();

-- Tasks from a meeting point back to it (deleting the meeting keeps the tasks)
alter table public.ghaith_tasks add column if not exists meeting_id uuid references public.ghaith_meetings (id) on delete set null;
create index if not exists ghaith_tasks_meeting_idx on public.ghaith_tasks (meeting_id) where meeting_id is not null;
