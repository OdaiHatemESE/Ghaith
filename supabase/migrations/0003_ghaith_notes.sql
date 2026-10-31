-- غيث's notebook: lasting facts about the person's work and life that it learns from the conversation
-- (who the manager is, which entities they deal with, project names), so it understands them better over time.
create table public.ghaith_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fact        text not null check (char_length(fact) between 2 and 400),
  created_at  timestamptz not null default now()
);
create index ghaith_notes_user_idx on public.ghaith_notes (user_id, created_at);
alter table public.ghaith_notes enable row level security;
create policy ghaith_notes_own on public.ghaith_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
