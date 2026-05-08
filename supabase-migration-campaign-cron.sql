-- ============================================================
-- Campaign worker cron (Supabase pg_cron + pg_net)
-- Run inline ≤10 recipients (handled in app). Cron drives >10.
-- ============================================================
-- Setup: Supabase Dashboard → Database → Extensions → enable
--   * pg_cron
--   * pg_net
-- Then run this file in SQL editor. Replace placeholders first:
--   <APP_URL>        e.g. https://your-app.vercel.app
--   <WORKER_SECRET>  same value as WORKER_SECRET in app env

-- Drop existing job if re-running
select cron.unschedule('campaign-worker') where exists (
  select 1 from cron.job where jobname = 'campaign-worker'
);

-- Schedule: every minute, POST to /api/campaigns/worker with Bearer auth
select cron.schedule(
  'campaign-worker',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://unisel-ai-whatsapp.vercel.app/api/campaigns/worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer shubhameijrnfeircbwjckncskdjnirbfrijfns'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Verify:
--   select * from cron.job where jobname = 'campaign-worker';
--   select * from cron.job_run_details order by start_time desc limit 10;

-- Manual one-shot trigger (run from SQL editor anytime):
--   select net.http_post(
--     url     := '<APP_URL>/api/campaigns/worker',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer <WORKER_SECRET>'
--     ),
--     body    := '{}'::jsonb
--   );

-- Stop the cron later:
--   select cron.unschedule('campaign-worker');
