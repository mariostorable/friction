-- ================================================================
-- Simulate the exact dashboard query for Mario
-- ================================================================

-- Mario's user_id
\set MARIO_USER_ID 'ab953672-7bad-4601-9289-5d766e73fec9'

-- Step 1: Get portfolios (simulating lines 97-101)
SELECT
  'Step 1: Portfolios' as step,
  portfolio_type,
  array_length(account_ids, 1) as account_count
FROM portfolios
WHERE user_id = :'MARIO_USER_ID'
ORDER BY portfolio_type;

-- Step 2: Get unique account IDs from EDGE + SiteLink portfolios
WITH portfolio_accounts AS (
  SELECT unnest(account_ids) as account_id
  FROM portfolios
  WHERE user_id = :'MARIO_USER_ID'
    AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
)
SELECT
  'Step 2: Unique Account IDs from portfolios' as step,
  COUNT(DISTINCT account_id) as unique_count,
  COUNT(account_id) as total_count
FROM portfolio_accounts;

-- Step 3: Query accounts with the exact filters from dashboard (line 183-185)
WITH portfolio_accounts AS (
  SELECT DISTINCT unnest(account_ids) as account_id
  FROM portfolios
  WHERE user_id = :'MARIO_USER_ID'
    AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
)
SELECT
  'Step 3: Accounts query with status=active filter' as step,
  COUNT(*) as returned_account_count
FROM accounts
WHERE id IN (SELECT account_id FROM portfolio_accounts)
  AND status = 'active'  -- This is line 184 in the dashboard
ORDER BY arr DESC;

-- Step 4: Check what statuses the portfolio accounts have
WITH portfolio_accounts AS (
  SELECT DISTINCT unnest(account_ids) as account_id
  FROM portfolios
  WHERE user_id = :'MARIO_USER_ID'
    AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
)
SELECT
  'Step 4: Status distribution of portfolio accounts' as step,
  status,
  COUNT(*) as count
FROM accounts
WHERE id IN (SELECT account_id FROM portfolio_accounts)
GROUP BY status
ORDER BY count DESC;

-- Step 5: Check vertical distribution for ACTIVE portfolio accounts
WITH portfolio_accounts AS (
  SELECT DISTINCT unnest(account_ids) as account_id
  FROM portfolios
  WHERE user_id = :'MARIO_USER_ID'
    AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
)
SELECT
  'Step 5: Vertical distribution for ACTIVE accounts' as step,
  vertical,
  COUNT(*) as count
FROM accounts
WHERE id IN (SELECT account_id FROM portfolio_accounts)
  AND status = 'active'
GROUP BY vertical
ORDER BY count DESC;

-- Step 6: Sample accounts that would be returned
WITH portfolio_accounts AS (
  SELECT DISTINCT unnest(account_ids) as account_id
  FROM portfolios
  WHERE user_id = :'MARIO_USER_ID'
    AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
)
SELECT
  'Step 6: Sample accounts returned by query' as step,
  name,
  status,
  vertical,
  products,
  arr
FROM accounts
WHERE id IN (SELECT account_id FROM portfolio_accounts)
  AND status = 'active'
ORDER BY arr DESC NULLS LAST
LIMIT 10;
