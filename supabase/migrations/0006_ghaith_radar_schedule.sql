-- Ghaith Radar: run the scan every 15 minutes, on the server, whether or not anyone opens the app.
-- pg_cron calls the ghaith-radar Edge Function through pg_net with the key kept in Vault (made in 0005).
-- To pause:  select cron.unschedule('ghaith-radar');
select cron.schedule(
  'ghaith-radar',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://eypcyrthilqohmawirly.supabase.co/functions/v1/ghaith-radar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-radar-key', (select decrypted_secret from vault.decrypted_secrets where name = 'ghaith_radar_key')),
    body := '{"mode":"scheduled"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
