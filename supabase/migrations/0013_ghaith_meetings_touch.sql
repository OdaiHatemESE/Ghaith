-- Meetings: their own updated_at trigger. 0012 reused ghaith_touch, which is written for tasks (it reads status and
-- done_at), so every update of a meeting failed with "record new has no field status".
create or replace function public.ghaith_touch_updated() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ghaith_meetings_touch on public.ghaith_meetings;
create trigger ghaith_meetings_touch before update on public.ghaith_meetings
  for each row execute function public.ghaith_touch_updated();
