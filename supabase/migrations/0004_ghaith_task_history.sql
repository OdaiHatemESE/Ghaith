-- Task history: every task keeps a timeline of what happened to it (created, changed, done, reopened) and the
-- notes/updates the user adds. Changes are recorded by a trigger, so edits from the app, from a capture and from
-- the complete RPC all land here the same way.

create table if not exists public.ghaith_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.ghaith_tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('created', 'updated', 'done', 'reopened', 'note')),
  changes jsonb,
  note text check (note is null or char_length(note) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists ghaith_task_events_task_idx on public.ghaith_task_events (task_id, created_at);
create index if not exists ghaith_task_events_user_idx on public.ghaith_task_events (user_id);

alter table public.ghaith_task_events enable row level security;
create policy ghaith_task_events_select on public.ghaith_task_events for select to authenticated
  using (user_id = (select auth.uid()));
-- Users add notes themselves; the other kinds come from the trigger (which also runs as the user)
create policy ghaith_task_events_insert on public.ghaith_task_events for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy ghaith_task_events_delete on public.ghaith_task_events for delete to authenticated
  using (user_id = (select auth.uid()) and kind = 'note');

create or replace function public.ghaith_log_task() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  diff jsonb := '{}'::jsonb;
  f text;
  o jsonb;
  n jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.ghaith_task_events (task_id, user_id, kind, changes)
    values (new.id, new.user_id, 'created', jsonb_build_object('source', new.source));
    return new;
  end if;

  foreach f in array array['title', 'notes', 'kind', 'category', 'priority', 'person', 'due_at', 'remind_at', 'repeat'] loop
    o := to_jsonb(old) -> f;
    n := to_jsonb(new) -> f;
    if o is distinct from n then
      diff := diff || jsonb_build_object(f, jsonb_build_array(o, n));
    end if;
  end loop;

  if old.status is distinct from new.status then
    insert into public.ghaith_task_events (task_id, user_id, kind, changes)
    values (new.id, new.user_id, case when new.status = 'done' then 'done' else 'reopened' end, nullif(diff, '{}'::jsonb));
  elsif diff <> '{}'::jsonb then
    insert into public.ghaith_task_events (task_id, user_id, kind, changes) values (new.id, new.user_id, 'updated', diff);
  end if;
  return new;
end $$;
revoke execute on function public.ghaith_log_task() from public, anon, authenticated;

drop trigger if exists ghaith_tasks_log on public.ghaith_tasks;
create trigger ghaith_tasks_log after insert or update on public.ghaith_tasks
  for each row execute function public.ghaith_log_task();

-- Existing tasks start their history at the moment they were created
insert into public.ghaith_task_events (task_id, user_id, kind, changes, created_at)
select t.id, t.user_id, 'created', jsonb_build_object('source', t.source), t.created_at
from public.ghaith_tasks t
where not exists (select 1 from public.ghaith_task_events e where e.task_id = t.id);
insert into public.ghaith_task_events (task_id, user_id, kind, created_at)
select t.id, t.user_id, 'done', t.done_at
from public.ghaith_tasks t
where t.status = 'done' and t.done_at is not null
  and not exists (select 1 from public.ghaith_task_events e where e.task_id = t.id and e.kind = 'done');
