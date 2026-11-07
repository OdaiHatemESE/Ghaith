-- Ghaith's own email address (where people send and forward mail), read by the app. Kept on the server so it can be
-- set or changed without an app update: re-create this function with the provider's inbound address. null = email to
-- Ghaith is not switched on yet, and the app says so.
create or replace function public.ghaith_inbox_address() returns text
language sql stable set search_path = '' as $$ select null::text $$;

revoke all on function public.ghaith_inbox_address() from public, anon;
grant execute on function public.ghaith_inbox_address() to authenticated;
