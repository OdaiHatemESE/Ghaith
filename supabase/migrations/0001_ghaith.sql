-- غيث (Ghaith): a voice-driven personal assistant that keeps track of tasks, follow-ups and replies.
-- It lives in the قديش (familypocket) Supabase project but only in its own ghaith_* tables and functions:
-- nothing here reads or changes قديش data. Sign-in reuses the existing قديش accounts.

-- Tasks: things I must do (todo), things I'm waiting on from someone (waiting), and messages I owe a reply to (reply)
create table public.ghaith_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 300),
  notes       text check (char_length(notes) <= 2000),
  kind        text not null default 'todo' check (kind in ('todo', 'waiting', 'reply')),
  category    text not null default 'work' check (category in ('work', 'home', 'car', 'family', 'personal', 'money', 'other')),
  priority    text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  person      text check (char_length(person) <= 120),
  due_at      timestamptz,
  remind_at   timestamptz,
  repeat      text check (repeat in ('daily', 'weekly', 'monthly', 'yearly')),
  status      text not null default 'open' check (status in ('open', 'done')),
  done_at     timestamptz,
  source      text not null default 'manual' check (source in ('voice', 'text', 'manual')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index ghaith_tasks_user_open_idx on public.ghaith_tasks (user_id, status, due_at);

-- The conversation with Ghaith (kept short: the app shows the latest, the agent reads the last few turns)
create table public.ghaith_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) <= 4000),
  actions     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index ghaith_messages_user_idx on public.ghaith_messages (user_id, created_at desc);

-- Personal settings: when the daily briefings arrive, whether replies are spoken, how soon to chase a follow-up
create table public.ghaith_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  morning_time     time default '08:00',
  evening_time     time default '20:00',
  speak_replies    boolean not null default true,
  follow_up_days   smallint not null default 3 check (follow_up_days between 1 and 30),
  updated_at       timestamptz not null default now()
);

alter table public.ghaith_tasks enable row level security;
alter table public.ghaith_messages enable row level security;
alter table public.ghaith_settings enable row level security;

-- Each person sees and changes only their own rows
create policy ghaith_tasks_own on public.ghaith_tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ghaith_messages_own on public.ghaith_messages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ghaith_settings_own on public.ghaith_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.ghaith_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.done_at := now(); end if;
  if new.status = 'open' then new.done_at := null; end if;
  return new;
end $$;

create trigger ghaith_tasks_touch before insert or update on public.ghaith_tasks
  for each row execute function public.ghaith_touch();

-- Marks a task done; a repeating task gets its next occurrence (same reminder time, moved forward).
-- Runs as the caller, so row-level security still applies. Returns the new task's id, or null.
create or replace function public.ghaith_complete_task(p_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  t public.ghaith_tasks;
  step interval;
  n int;
  next_id uuid;
begin
  update public.ghaith_tasks set status = 'done' where id = p_id and status = 'open' returning * into t;
  if t.id is null or t.repeat is null then return null; end if;
  step := case t.repeat when 'daily' then interval '1 day' when 'weekly' then interval '7 days'
                        when 'monthly' then interval '1 month' else interval '1 year' end;
  -- Done late? Skip occurrences already in the past
  n := 1;
  while coalesce(t.due_at, t.remind_at) is not null and coalesce(t.due_at, t.remind_at) + step * n <= now() and n < 400 loop
    n := n + 1;
  end loop;
  insert into public.ghaith_tasks (user_id, title, notes, kind, category, priority, person, due_at, remind_at, repeat, source)
  values (t.user_id, t.title, t.notes, t.kind, t.category, t.priority, t.person,
          t.due_at + step * n, t.remind_at + step * n, t.repeat, t.source)
  returning id into next_id;
  return next_id;
end $$;

revoke execute on function public.ghaith_complete_task(uuid) from public, anon;
grant execute on function public.ghaith_complete_task(uuid) to authenticated;
revoke execute on function public.ghaith_touch() from public, anon, authenticated;
