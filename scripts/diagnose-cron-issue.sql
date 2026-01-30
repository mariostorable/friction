-- ================================================================
-- Diagnose Cron Job Issue
-- Run this in Supabase SQL Editor to check what's wrong
-- ================================================================

-- STEP 1: Check if the cron job exists and is active
SELECT
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname LIKE '%analyze%'
ORDER BY jobid;

-- Expected: You should see 'analyze-portfolio-every-10min' with active = true
-- If active = false or job doesn't exist, the cron is not running


-- STEP 2: Check recent job execution history (last 50 runs)
SELECT
  jobid,
  runid,
  status,
  return_message,
  start_time,
  end_time,
  EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds
FROM cron.job_run_details
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE '%analyze%')
ORDER BY start_time DESC
LIMIT 50;

-- Expected: You should see runs every 10 minutes with status = 'succeeded'
-- If no recent runs: Job is not executing
-- If status = 'failed': Check return_message for errors


-- STEP 3: Count successful vs failed runs by date
SELECT
  DATE(start_time) as run_date,
  status,
  COUNT(*) as count,
  MIN(start_time) as first_run,
  MAX(start_time) as last_run
FROM cron.job_run_details
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE '%analyze%')
GROUP BY DATE(start_time), status
ORDER BY run_date DESC, status;

-- This shows you when the job last ran successfully


-- STEP 4: Check if there are any stale snapshots blocking analysis
SELECT
  a.name as account_name,
  a.id as account_id,
  s.snapshot_date,
  s.ofi_score,
  s.created_at
FROM accounts a
LEFT JOIN LATERAL (
  SELECT *
  FROM account_snapshots
  WHERE account_id = a.id
  ORDER BY snapshot_date DESC
  LIMIT 1
) s ON true
WHERE a.status != 'cancelled' AND a.status != 'churned'
ORDER BY s.snapshot_date ASC NULLS FIRST
LIMIT 35;

-- This shows which accounts need analysis (oldest snapshots first)
-- If snapshot_date = today, the account was already analyzed today


-- STEP 5: Check if pg_net extension is working
SELECT net.http_get(
  url := 'https://httpbin.org/get',
  headers := jsonb_build_object('Content-Type', 'application/json')
) as test_request_id;

-- Expected: Returns a request_id (UUID)
-- If error: pg_net extension might be disabled or broken


-- ================================================================
-- FIXES BASED ON DIAGNOSIS
-- ================================================================

-- FIX 1: If job doesn't exist or is inactive, recreate it
-- Uncomment these lines to recreate the job:

-- SELECT cron.unschedule('analyze-portfolio-every-10min');
--
-- SELECT cron.schedule(
--   'analyze-portfolio-every-10min',
--   '*/10 * * * *',
--   $$
--   SELECT
--     net.http_get(
--       url := 'https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
--       headers := jsonb_build_object('Content-Type', 'application/json')
--     ) as request_id;
--   $$
-- );


-- FIX 2: If there are duplicate jobs, remove them
-- SELECT cron.unschedule(jobid::text)
-- FROM cron.job
-- WHERE jobname LIKE '%analyze%' AND jobid != (
--   SELECT MIN(jobid) FROM cron.job WHERE jobname LIKE '%analyze%'
-- );


-- FIX 3: Manually trigger the job to test if it works
-- SELECT net.http_get(
--   url := 'https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
--   headers := jsonb_build_object('Content-Type', 'application/json')
-- ) as manual_trigger_request_id;


-- STEP 6: After running fixes, verify the job is working
-- Wait 10 minutes, then run this to see if new runs appear:
-- SELECT * FROM cron.job_run_details
-- WHERE start_time > NOW() - INTERVAL '15 minutes'
-- ORDER BY start_time DESC;
