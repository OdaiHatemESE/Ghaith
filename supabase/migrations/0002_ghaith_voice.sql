-- غيث: which voice reads the replies, and whether the conversation keeps listening after each reply
alter table public.ghaith_settings
  add column voice text not null default 'hamdan' check (voice in ('hamdan', 'fatima', 'device')),
  add column keep_listening boolean not null default true;
