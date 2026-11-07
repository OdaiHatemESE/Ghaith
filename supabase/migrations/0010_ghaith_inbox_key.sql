-- The webhook key for email to Ghaith. The database makes it (random, 64 hex characters) and keeps it in Vault, so
-- it is never typed or pasted anywhere but the email provider's webhook URL (…/ghaith-inbox?key=<it>). To read it:
-- Dashboard → Integrations → Vault → ghaith_inbox_key. To change it: update that secret, then the provider's URL.
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'ghaith_inbox_key',
  'Webhook key for email to Ghaith: the ?key= in the email provider''s inbound URL'
)
where not exists (select 1 from vault.secrets where name = 'ghaith_inbox_key');

-- Only the inbox function (service role) can ask whether a key is right; nobody can read it through the API
create or replace function public.ghaith_inbox_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(char_length(p_key) >= 32, false)
     and exists (select 1 from vault.decrypted_secrets where name = 'ghaith_inbox_key' and decrypted_secret = p_key);
$$;
revoke all on function public.ghaith_inbox_key_ok(text) from public, anon, authenticated;
grant execute on function public.ghaith_inbox_key_ok(text) to service_role;
