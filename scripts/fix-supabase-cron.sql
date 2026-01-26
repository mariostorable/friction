-- ================================================================
-- Fix Supabase cron - remove Authorization header that references unconfigured setting
-- Run this in Supabase SQL Editor
-- ================================================================

-- Remove the existing job
SELECT cron.unschedule('analyze-portfolio-every-20min');

-- Create a new cron job without the Authorization header reference
-- (Auth is currently disabled in the endpoint anyway)
SELECT cron.schedule(
  'analyze-portfolio-every-20min',
  '*/20 * * * *',
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

-- Check if the job was created successfully
SELECT jobid, schedule, command, active FROM cron.job;

-- Check recent job run history (look for failures)
SELECT
  jobid,
  runid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
