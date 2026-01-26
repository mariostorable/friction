-- ================================================================
-- Check analysis status to understand what's happening
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. Check cron job status
SELECT jobid, schedule, command, active
FROM cron.job
WHERE jobname = 'analyze-portfolio-every-20min';

-- 2. Check recent cron runs (last 10)
SELECT
  jobid,
  runid,
  status,
  return_message,
  start_time,
  end_time,
  EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- 3. Count accounts by analysis status today
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM account_snapshots
      WHERE account_snapshots.account_id = accounts.id
      AND account_snapshots.snapshot_date::date = CURRENT_DATE
    ) THEN 'Analyzed Today'
    ELSE 'Pending'
  END as status,
  COUNT(*) as count
FROM accounts
WHERE user_id IN (SELECT id FROM auth.users LIMIT 1)
GROUP BY status;

-- 4. Show which specific accounts were analyzed today
SELECT
  a.name,
  a.salesforce_id,
  s.snapshot_date,
  s.ofi_score
FROM accounts a
JOIN account_snapshots s ON s.account_id = a.id
WHERE s.snapshot_date::date = CURRENT_DATE
  AND a.user_id IN (SELECT id FROM auth.users LIMIT 1)
ORDER BY s.snapshot_date DESC;

-- 5. Show pending accounts (no snapshot today)
SELECT
  a.id,
  a.name,
  a.arr,
  MAX(s.snapshot_date) as last_analyzed
FROM accounts a
LEFT JOIN account_snapshots s ON s.account_id = a.id
WHERE a.user_id IN (SELECT id FROM auth.users LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM account_snapshots
    WHERE account_id = a.id
    AND snapshot_date::date = CURRENT_DATE
  )
GROUP BY a.id, a.name, a.arr
ORDER BY a.arr DESC NULLS LAST;
