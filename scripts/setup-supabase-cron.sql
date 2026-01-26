-- ================================================================
-- Setup pg_cron to call the Vercel analyze endpoint every 20 minutes
-- Run this in Supabase SQL Editor
-- ================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing jobs with this name to avoid duplicates
SELECT cron.unschedule('analyze-portfolio-every-20min');

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
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
      )
    ) as request_id;
  $$
);

-- Set the cron secret (replace with your actual CRON_SECRET from Vercel env vars)
-- This is commented out by default since auth is currently disabled in your endpoint
-- Uncomment and set the secret when you re-enable auth:
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'your-cron-secret-here';

-- View all scheduled jobs
SELECT jobid, schedule, command, active FROM cron.job;

-- Check recent job run history
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- To manually trigger the job for testing:
-- SELECT net.http_get(
--   url := 'https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
--   headers := jsonb_build_object('Content-Type', 'application/json')
-- );

-- To remove the job (if needed):
-- SELECT cron.unschedule('analyze-portfolio-every-20min');
