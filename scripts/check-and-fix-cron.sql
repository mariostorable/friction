-- ================================================================
-- Check and Fix Cron Job for Account Analysis
-- Run this in Supabase SQL Editor
-- ================================================================

-- STEP 1: Check if cron job exists and is active
SELECT
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname = 'analyze-portfolio-hourly'
ORDER BY jobid;

-- Expected: One job with active = true, schedule = '0 * * * *' (every hour)
-- If no results or active = false, the cron is not running!


-- STEP 2: Check recent execution history (last 24 hours)
SELECT
  j.jobname,
  jrd.status,
  jrd.return_message,
  jrd.start_time AT TIME ZONE 'UTC' as start_time_utc,
  jrd.end_time AT TIME ZONE 'UTC' as end_time_utc,
  EXTRACT(EPOCH FROM (jrd.end_time - jrd.start_time)) as duration_seconds
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
WHERE j.jobname = 'analyze-portfolio-hourly'
  AND jrd.start_time > NOW() - INTERVAL '24 hours'
ORDER BY jrd.start_time DESC;

-- Expected: You should see hourly runs with status = 'succeeded'
-- If no recent runs: Job is not executing
-- If status = 'failed': Check return_message for errors


-- STEP 3: Count runs in the last 7 days
SELECT
  DATE(start_time AT TIME ZONE 'UTC') as run_date,
  status,
  COUNT(*) as run_count
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
WHERE j.jobname = 'analyze-portfolio-hourly'
  AND jrd.start_time > NOW() - INTERVAL '7 days'
GROUP BY DATE(start_time AT TIME ZONE 'UTC'), status
ORDER BY run_date DESC;

-- Expected: ~24 runs per day (one per hour)


-- ================================================================
-- FIX 1: If job doesn't exist, create it
-- ================================================================
-- Uncomment the lines below if the job doesn't exist:

-- SELECT cron.schedule(
--     'analyze-portfolio-hourly',
--     '0 * * * *',
--     $$
--     SELECT
--       net.http_post(
--           url:='https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
--           headers:='{"Content-Type": "application/json"}'::jsonb
--       ) as request_id;
--     $$
-- );


-- ================================================================
-- FIX 2: If job exists but is inactive, reactivate it
-- ================================================================
-- Uncomment the line below to reactivate:

-- UPDATE cron.job SET active = true WHERE jobname = 'analyze-portfolio-hourly';


-- ================================================================
-- FIX 3: If there are duplicate jobs, remove extras
-- ================================================================
-- Uncomment to remove duplicate jobs (keeps the first one):

-- SELECT cron.unschedule(jobid::bigint)
-- FROM cron.job
-- WHERE jobname = 'analyze-portfolio-hourly'
--   AND jobid != (SELECT MIN(jobid) FROM cron.job WHERE jobname = 'analyze-portfolio-hourly');


-- ================================================================
-- FIX 4: Manually trigger the job RIGHT NOW (for testing)
-- ================================================================
-- Uncomment to trigger immediately:

-- SELECT net.http_post(
--     url:='https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
--     headers:='{"Content-Type": "application/json"}'::jsonb
-- ) as manual_trigger_request_id;


-- ================================================================
-- STEP 4: After fixes, verify the job is running
-- ================================================================
-- Wait 5 minutes after manually triggering, then run this:

-- SELECT
--   a.name as account_name,
--   s.snapshot_date,
--   s.ofi_score,
--   s.created_at AT TIME ZONE 'UTC' as created_at_utc
-- FROM accounts a
-- LEFT JOIN LATERAL (
--   SELECT *
--   FROM account_snapshots
--   WHERE account_id = a.id
--   ORDER BY snapshot_date DESC
--   LIMIT 1
-- ) s ON true
-- WHERE a.status = 'active'
-- ORDER BY s.snapshot_date DESC NULLS LAST
-- LIMIT 40;

-- Expected: Recent snapshots with created_at_utc within the last few hours
