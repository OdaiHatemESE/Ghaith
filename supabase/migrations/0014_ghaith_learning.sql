-- Learning notebook: a course, training or talk is written the same way as a meeting (a title, who gave it, points as
-- they come), but Ghaith organises it into what to keep (takeaways, terms, what to read more about, how to apply it)
-- instead of decisions and actions. Same table, told apart by kind. Points may carry a tag:
-- key (important), read (read more about it), question, quote.
alter table public.ghaith_meetings add column if not exists kind text not null default 'meeting'
  check (kind in ('meeting', 'learning'));
create index if not exists ghaith_meetings_kind_idx on public.ghaith_meetings (user_id, kind, held_at desc);
