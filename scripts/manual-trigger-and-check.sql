-- ================================================================
-- Manual Trigger and Check Analysis Status
-- Run this in Supabase SQL Editor to manually trigger analysis
-- and monitor progress
-- ================================================================

-- STEP 1: Check which accounts need analysis TODAY
SELECT
  a.name as account_name,
  a.status,
  CASE
    WHEN s.snapshot_date = CURRENT_DATE THEN '✓ Analyzed Today'
    WHEN s.snapshot_date IS NULL THEN '❌ Never Analyzed'
    ELSE '⏳ Needs Analysis (last: ' || s.snapshot_date::text || ')'
  END as analysis_status,
  s.ofi_score as last_ofi,
  s.case_volume as last_cases,
  s.created_at AT TIME ZONE 'UTC' as last_analyzed_utc
FROM accounts a
LEFT JOIN LATERAL (
  SELECT *
  FROM account_snapshots
  WHERE account_id = a.id
  ORDER BY snapshot_date DESC
  LIMIT 1
) s ON true
WHERE a.status = 'active'
ORDER BY
  CASE
    WHEN s.snapshot_date = CURRENT_DATE THEN 2
    WHEN s.snapshot_date IS NULL THEN 0
    ELSE 1
  END,
  a.arr DESC NULLS LAST
LIMIT 50;

-- Expected output:
-- Accounts with ❌ or ⏳ need analysis
-- Count how many show ⏳ - that's your backlog


-- ================================================================
-- STEP 2: Manually trigger the analysis RIGHT NOW
-- ================================================================
-- Uncomment the line below to trigger:

-- SELECT net.http_post(
--     url:='https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
--     headers:='{"Content-Type": "application/json"}'::jsonb
-- ) as manual_trigger_request_id;

-- Expected output: A UUID request ID
-- If you get an error, pg_net extension might not be enabled


-- ================================================================
-- STEP 3: Wait 2 minutes, then check progress
-- ================================================================
-- Run this after waiting 2 minutes:

-- SELECT
--   COUNT(*) as accounts_analyzed_today,
--   MIN(created_at AT TIME ZONE 'UTC') as first_analyzed_utc,
--   MAX(created_at AT TIME ZONE 'UTC') as most_recent_utc,
--   SUM(case_volume) as total_cases_analyzed
-- FROM account_snapshots
-- WHERE snapshot_date = CURRENT_DATE;

-- Expected: accounts_analyzed_today should increase after each run


-- ================================================================
-- STEP 4: Check detailed results for today's analysis
-- ================================================================
-- Run this to see all accounts analyzed today:

-- SELECT
--   a.name as account_name,
--   s.snapshot_date,
--   s.ofi_score,
--   s.case_volume,
--   s.friction_card_count,
--   s.high_severity_count,
--   s.trend_direction,
--   s.created_at AT TIME ZONE 'UTC' as analyzed_at_utc
-- FROM account_snapshots s
-- JOIN accounts a ON a.id = s.account_id
-- WHERE s.snapshot_date = CURRENT_DATE
-- ORDER BY s.created_at DESC;

-- Expected: List of all accounts analyzed today with their scores


-- ================================================================
-- STEP 5: Check if there are any stuck/old analysis runs
-- ================================================================
-- Check for raw_inputs or friction_cards created recently but not converted to snapshots:

-- SELECT
--   a.name as account_name,
--   COUNT(DISTINCT ri.id) as raw_inputs_count,
--   COUNT(DISTINCT fc.id) as friction_cards_count,
--   MAX(ri.created_at) AT TIME ZONE 'UTC' as last_input_utc,
--   MAX(fc.created_at) AT TIME ZONE 'UTC' as last_card_utc
-- FROM accounts a
-- LEFT JOIN raw_inputs ri ON ri.account_id = a.id AND ri.created_at > NOW() - INTERVAL '1 hour'
-- LEFT JOIN friction_cards fc ON fc.account_id = a.id AND fc.created_at > NOW() - INTERVAL '1 hour'
-- WHERE a.status = 'active'
-- GROUP BY a.id, a.name
-- HAVING COUNT(DISTINCT ri.id) > 0 OR COUNT(DISTINCT fc.id) > 0
-- ORDER BY last_input_utc DESC NULLS LAST;

-- Expected: If empty, no recent activity. If rows, analysis is in progress.


-- ================================================================
-- TROUBLESHOOTING
-- ================================================================

-- If no accounts are being analyzed:
-- 1. Check Vercel logs for errors
-- 2. Check Salesforce connection is active
-- 3. Verify accounts are in portfolios:

-- SELECT
--   p.name as portfolio_name,
--   p.portfolio_type,
--   CARDINALITY(p.account_ids) as account_count
-- FROM portfolios p
-- ORDER BY p.created_at DESC;

-- Expected: Should show "Top 25 Storage Accounts" and "Top 25 Marine Accounts"


-- If analysis is slow:
-- 1. Check how many cases are being analyzed per account:

-- SELECT
--   a.name as account_name,
--   COUNT(ri.id) as case_count,
--   MAX(ri.created_at) AT TIME ZONE 'UTC' as last_case_created
-- FROM accounts a
-- JOIN raw_inputs ri ON ri.account_id = a.id
-- WHERE ri.created_at > NOW() - INTERVAL '24 hours'
-- GROUP BY a.id, a.name
-- ORDER BY case_count DESC
-- LIMIT 10;

-- Expected: Should see accounts with realistic case counts (e.g., 10-200 cases)
-- If you see 2000 cases per account, that's the LIMIT working


-- If you see errors in Vercel logs about "Max retries exceeded":
-- The Claude API might be overloaded. The code has retry logic with exponential backoff.
-- Just wait 10-15 minutes and the job will continue.
