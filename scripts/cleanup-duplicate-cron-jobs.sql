-- ================================================================
-- Clean up duplicate/old cron jobs
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. First, check all existing jobs
SELECT
  jobid,
  schedule,
  active,
  jobname
FROM cron.job
ORDER BY jobid;

-- 2. Remove old jobs (keep only analyze-portfolio-every-10min with jobid 9)
-- Unschedule any jobs that are NOT jobid 9
SELECT cron.unschedule(jobid::bigint)
FROM cron.job
WHERE jobname IN (
  'analyze-portfolio-every-10min',
  'analyze-portfolio-every-20min'
)
AND jobid != 9;

-- 3. Verify only the correct job remains
SELECT
  jobid,
  schedule,
  active,
  jobname,
  command
FROM cron.job
WHERE jobname LIKE 'analyze-portfolio%'
ORDER BY jobid;

-- Expected result: Only jobid 9 with schedule '*/10 * * * *' should remain
