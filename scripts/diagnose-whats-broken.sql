-- ================================================================
-- Quick diagnostic: What broke in the last 5 hours?
-- Run this to see the current state vs expected state
-- ================================================================

-- Your user_id
\set USER_ID 'e6d235ad-1cc7-410f-84b4-7cc74bf93b44'

-- ================================================================
-- 1. Do portfolios exist and what's in them?
-- ================================================================
SELECT
  '=== PORTFOLIOS ===' as section,
  portfolio_type,
  name,
  array_length(account_ids, 1) as account_count,
  created_at,
  updated_at
FROM portfolios
WHERE user_id = :'USER_ID'
  AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
ORDER BY portfolio_type;

-- ================================================================
-- 2. How many active storage accounts exist?
-- ================================================================
SELECT
  '=== ACTIVE STORAGE ACCOUNTS ===' as section,
  COUNT(*) as total_active_storage_accounts
FROM accounts
WHERE user_id = :'USER_ID'
  AND status = 'active'
  AND vertical = 'storage';

-- ================================================================
-- 3. Are active accounts in the portfolios?
-- ================================================================
SELECT
  '=== ACCOUNT PORTFOLIO MEMBERSHIP ===' as section,
  CASE
    WHEN id = ANY(
      SELECT unnest(account_ids)
      FROM portfolios
      WHERE user_id = :'USER_ID' AND portfolio_type = 'top_25_edge'
    ) THEN 'In EDGE portfolio'
    WHEN id = ANY(
      SELECT unnest(account_ids)
      FROM portfolios
      WHERE user_id = :'USER_ID' AND portfolio_type = 'top_25_sitelink'
    ) THEN 'In SiteLink portfolio'
    ELSE 'NOT in any portfolio'
  END as membership,
  COUNT(*) as count
FROM accounts
WHERE user_id = :'USER_ID'
  AND status = 'active'
  AND vertical = 'storage'
GROUP BY membership;

-- ================================================================
-- 4. What are the actual accounts and their status?
-- ================================================================
SELECT
  '=== SAMPLE ACCOUNTS ===' as section,
  name,
  arr,
  status,
  vertical,
  products,
  CASE
    WHEN id = ANY(
      SELECT unnest(account_ids)
      FROM portfolios
      WHERE user_id = :'USER_ID' AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
    ) THEN '✓ In Portfolio'
    ELSE '✗ Missing'
  END as portfolio_status
FROM accounts
WHERE user_id = :'USER_ID'
ORDER BY arr DESC NULLS LAST
LIMIT 10;

-- ================================================================
-- 5. Recent changes to accounts table (status changes, etc)
-- ================================================================
SELECT
  '=== RECENT ACCOUNT UPDATES ===' as section,
  name,
  status,
  vertical,
  updated_at,
  last_synced_at
FROM accounts
WHERE user_id = :'USER_ID'
  AND updated_at > NOW() - INTERVAL '6 hours'
ORDER BY updated_at DESC
LIMIT 20;

-- ================================================================
-- 6. Recent changes to portfolios
-- ================================================================
SELECT
  '=== RECENT PORTFOLIO CHANGES ===' as section,
  portfolio_type,
  name,
  array_length(account_ids, 1) as account_count,
  updated_at
FROM portfolios
WHERE user_id = :'USER_ID'
  AND updated_at > NOW() - INTERVAL '6 hours'
ORDER BY updated_at DESC;
