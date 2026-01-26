-- ================================================================
-- Setup pg_cron to call the Vercel analyze endpoint every 20 minutes
-- Run this in Supabase SQL Editor
-- ================================================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job that runs every 20 minutes
-- This will call your Vercel endpoint which processes 3 accounts per run
-- With 17 pending accounts, this will complete in about 2 hours
SELECT cron.schedule(
  'analyze-portfolio-every-20min',     -- Job name
  '*/20 * * * *',                       -- Run every 20 minutes
  $$
  SELECT
    net.http_get(
      url := 'https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )
    ) as request_id;
  $$
);

-- View all scheduled jobs
SELECT * FROM cron.job;

-- To check job run history (after it runs):
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- To remove the job (if needed):
-- SELECT cron.unschedule('analyze-portfolio-every-20min');
