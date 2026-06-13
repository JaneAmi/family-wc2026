-- Family World Cup 2026 — daily sync via Supabase (no Vercel needed).
-- HOW TO USE: open Supabase → SQL Editor → paste this whole file → Run.
-- Prerequisite: deploy the `sync` Edge Function first (see supabase/functions/sync),
-- with "Verify JWT" turned OFF.
--
-- This schedules the edge function to run every day at 06:00 UTC using pg_cron,
-- calling it over HTTP with pg_net. Safe to re-run: it replaces the existing job.

-- 1) Enable the scheduler + HTTP client extensions (idempotent).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Remove a previous schedule with the same name, if any.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'wc2026-daily-sync') then
    perform cron.unschedule('wc2026-daily-sync');
  end if;
end $$;

-- 3) Schedule the daily call. The URL already points at this project; if you
--    cloned to a different Supabase project, change the host accordingly.
select cron.schedule(
  'wc2026-daily-sync',
  '0 6 * * *',
  $$
  select net.http_post(
    url     := 'https://jrscgnbzoqxjvfxvvwcg.supabase.co/functions/v1/sync',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);

-- Optional checks:
--   select jobid, jobname, schedule, active from cron.job;        -- is it scheduled?
--   select * from cron.job_run_details order by start_time desc limit 5;  -- did it run?
--   To trigger once right now, just run the inner net.http_post(...) above.
