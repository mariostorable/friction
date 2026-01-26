-- ================================================================
-- Check Supabase Cron Status and Clean Up Duplicates
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. Check all scheduled jobs
SELECT
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobname
FROM cron.job
ORDER BY jobid;

-- 2. Check recent job execution history (last 20 runs)
SELECT
  jobid,
  runid,
  job_pid,
  status,
  return_message,
  start_time,
  end_time,
  EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- 3. Count successful vs failed runs
SELECT
  jobid,
  status,
  COUNT(*) as count,
  MAX(start_time) as last_run
FROM cron.job_run_details
GROUP BY jobid, status
ORDER BY jobid, status;

-- 4. Remove duplicate jobs (keeps only the first one)
-- Uncomment the line below to actually delete the duplicate:
-- SELECT cron.unschedule(jobid::text) FROM cron.job WHERE jobid > 1 AND jobname = 'analyze-portfolio-every-20min';

-- 5. After cleaning up, verify only one job remains
SELECT COUNT(*) as job_count FROM cron.job WHERE jobname = 'analyze-portfolio-every-20min';
