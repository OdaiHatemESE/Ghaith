-- Work and personal: three more specific work categories (meetings, email, reports) beside the general one. A task's
-- space is its category's: work, meeting, email and report are work; home, car, family, personal, money and other
-- are personal. Widening the check only: existing rows are unchanged.
alter table public.ghaith_tasks drop constraint if exists ghaith_tasks_category_check;
alter table public.ghaith_tasks add constraint ghaith_tasks_category_check
  check (category in ('work', 'meeting', 'email', 'report', 'home', 'car', 'family', 'personal', 'money', 'other'));
