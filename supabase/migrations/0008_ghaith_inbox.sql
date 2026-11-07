-- Email to Ghaith: each person links the addresses they send from. An email from a linked (verified) address is
-- read by the capture engine on the server and saved as proposals that wait for the person's approval.
-- Additive only: two new tables. Nothing existing is changed.

-- 1. Linked addresses. The app adds an address; the server makes a random code; the address is verified when an
-- email from it reaches Ghaith with that code. Only the server can mark an address verified.
create table if not exists public.ghaith_senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254 and email like '%_@_%._%'),
  code text not null default ('GH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ghaith_senders_user_email_key unique (user_id, email)
);
-- A verified address belongs to one person only
create unique index if not exists ghaith_senders_verified_email_idx on public.ghaith_senders (email) where verified_at is not null;

alter table public.ghaith_senders enable row level security;
create policy ghaith_senders_select on public.ghaith_senders for select to authenticated using (user_id = (select auth.uid()));
create policy ghaith_senders_insert on public.ghaith_senders for insert to authenticated with check (user_id = (select auth.uid()) and verified_at is null);
create policy ghaith_senders_delete on public.ghaith_senders for delete to authenticated using (user_id = (select auth.uid()));
-- People may only choose the address: the code and the verification come from the database and the server
revoke all on public.ghaith_senders from anon;
revoke insert, update on public.ghaith_senders from authenticated;
grant insert (email) on public.ghaith_senders to authenticated;

-- At most 5 linked addresses per person
create or replace function public.ghaith_senders_limit() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.ghaith_senders where user_id = new.user_id) >= 5 then
    raise exception 'ghaith_senders: at most 5 addresses';
  end if;
  return new;
end $$;
drop trigger if exists ghaith_senders_limit on public.ghaith_senders;
create trigger ghaith_senders_limit before insert on public.ghaith_senders for each row execute function public.ghaith_senders_limit();

-- 2. What arrived by email, and what Ghaith proposes from it. Only a short excerpt of the email is kept.
create table if not exists public.ghaith_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id text not null check (char_length(message_id) <= 300),
  kind text not null default 'email' check (kind in ('email', 'verify')),
  sender text not null check (char_length(sender) <= 254),
  sender_name text check (char_length(sender_name) <= 200),
  subject text check (char_length(subject) <= 500),
  excerpt text check (char_length(excerpt) <= 1500),
  proposals jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'dismissed', 'failed')),
  error text check (char_length(error) <= 200),
  received_at timestamptz not null default now(),
  decided_at timestamptz,
  -- the provider retries until it gets an answer: the same message is stored once
  constraint ghaith_inbox_message_key unique (user_id, message_id)
);
create index if not exists ghaith_inbox_user_status_idx on public.ghaith_inbox (user_id, status, received_at desc);

alter table public.ghaith_inbox enable row level security;
create policy ghaith_inbox_select on public.ghaith_inbox for select to authenticated using (user_id = (select auth.uid()));
create policy ghaith_inbox_update on public.ghaith_inbox for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- People only mark an item done or dismissed; the server writes everything else
revoke all on public.ghaith_inbox from anon;
revoke insert, update, delete on public.ghaith_inbox from authenticated;
grant update (status, decided_at) on public.ghaith_inbox to authenticated;
