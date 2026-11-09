-- Task history: every task keeps a timeline of what happened to it (created, changed, done, reopened) and the
-- notes/updates the user adds. Changes are recorded by a trigger, so edits from the app, from a capture and from
-- the complete RPC all land here the same way. A change can carry the person's comment (why it was postponed, how
-- it was done): the functions below take it and the trigger stores it with the change.

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
  c text;
begin
  -- The comment for this change, when it came through ghaith_change_task / ghaith_complete_task / ghaith_reopen_task
  c := nullif(current_setting('ghaith.comment', true), '');
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
    insert into public.ghaith_task_events (task_id, user_id, kind, changes, note)
    values (new.id, new.user_id, case when new.status = 'done' then 'done' else 'reopened' end, nullif(diff, '{}'::jsonb), c);
  elsif diff <> '{}'::jsonb then
    insert into public.ghaith_task_events (task_id, user_id, kind, changes, note) values (new.id, new.user_id, 'updated', diff, c);
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

-- Changing a task with a comment. Only the editable fields are taken from p_fields; row-level security applies
-- (the function runs as the caller).
create or replace function public.ghaith_change_task(p_id uuid, p_fields jsonb, p_comment text default null) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r public.ghaith_tasks;
begin
  perform set_config('ghaith.comment', left(coalesce(btrim(p_comment), ''), 2000), true);
  select * into r from public.ghaith_tasks where id = p_id;
  if r.id is null then raise exception 'ghaith_change_task: task not found'; end if;
  r := jsonb_populate_record(r, p_fields - array['id', 'user_id', 'status', 'done_at', 'created_at', 'updated_at', 'source']);
  update public.ghaith_tasks
     set title = r.title, notes = r.notes, kind = r.kind, category = r.category, priority = r.priority,
         person = r.person, due_at = r.due_at, remind_at = r.remind_at, repeat = r.repeat
   where id = p_id;
  perform set_config('ghaith.comment', '', true); -- belongs to this change only
end $$;
revoke execute on function public.ghaith_change_task(uuid, jsonb, text) from public, anon;
grant execute on function public.ghaith_change_task(uuid, jsonb, text) to authenticated;

-- Done, with how it went (optional). Replaces the one-argument version; calls without a comment still work.
drop function if exists public.ghaith_complete_task(uuid);
create or replace function public.ghaith_complete_task(p_id uuid, p_comment text default null) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  t public.ghaith_tasks;
  step interval;
  n int;
  next_id uuid;
begin
  perform set_config('ghaith.comment', left(coalesce(btrim(p_comment), ''), 2000), true);
  update public.ghaith_tasks set status = 'done' where id = p_id and status = 'open' returning * into t;
  perform set_config('ghaith.comment', '', true); -- the next occurrence starts without it
  if t.id is null or t.repeat is null then return null; end if;
  step := case t.repeat when 'daily' then interval '1 day' when 'weekly' then interval '7 days'
                        when 'monthly' then interval '1 month' else interval '1 year' end;
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
revoke execute on function public.ghaith_complete_task(uuid, text) from public, anon;
grant execute on function public.ghaith_complete_task(uuid, text) to authenticated;

-- Reopened, with why (optional)
create or replace function public.ghaith_reopen_task(p_id uuid, p_comment text default null) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform set_config('ghaith.comment', left(coalesce(btrim(p_comment), ''), 2000), true);
  update public.ghaith_tasks set status = 'open' where id = p_id;
  perform set_config('ghaith.comment', '', true);
end $$;
revoke execute on function public.ghaith_reopen_task(uuid, text) from public, anon;
grant execute on function public.ghaith_reopen_task(uuid, text) to authenticated;
