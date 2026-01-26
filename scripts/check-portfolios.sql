-- ================================================================
-- Check portfolio sizes and account overlap
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. Check portfolio sizes
SELECT
  name,
  portfolio_type,
  array_length(account_ids, 1) as account_count,
  created_at
FROM portfolios
ORDER BY created_at DESC;

-- 2. Check for accounts in both portfolios
WITH edge_portfolio AS (
  SELECT unnest(account_ids) as account_id
  FROM portfolios
  WHERE portfolio_type = 'top_25_edge'
),
sitelink_portfolio AS (
  SELECT unnest(account_ids) as account_id
  FROM portfolios
  WHERE portfolio_type = 'top_25_sitelink'
)
SELECT
  a.name,
  a.vertical,
  a.arr
FROM accounts a
WHERE a.id IN (SELECT account_id FROM edge_portfolio)
  AND a.id IN (SELECT account_id FROM sitelink_portfolio)
ORDER BY a.arr DESC;

-- 3. Count unique accounts across both portfolios
WITH all_portfolio_accounts AS (
  SELECT unnest(account_ids) as account_id
  FROM portfolios
  WHERE portfolio_type IN ('top_25_edge', 'top_25_sitelink')
)
SELECT
  COUNT(DISTINCT account_id) as unique_account_count,
  COUNT(account_id) as total_account_slots
FROM all_portfolio_accounts;

-- 4. Show EDGE portfolio accounts
SELECT
  a.name,
  a.vertical,
  a.arr
FROM accounts a
WHERE a.id IN (
  SELECT unnest(account_ids)
  FROM portfolios
  WHERE portfolio_type = 'top_25_edge'
)
ORDER BY a.arr DESC;

-- 5. Show SiteLink portfolio accounts
SELECT
  a.name,
  a.vertical,
  a.arr
FROM accounts a
WHERE a.id IN (
  SELECT unnest(account_ids)
  FROM portfolios
  WHERE portfolio_type = 'top_25_sitelink'
)
ORDER BY a.arr DESC;

-- 6. Check if there are enough accounts with each software type
SELECT
  'EDGE' as software,
  COUNT(*) as account_count
FROM accounts
WHERE vertical LIKE '%EDGE%'
  AND arr > 0
  AND user_id IN (SELECT id FROM auth.users LIMIT 1)

UNION ALL

SELECT
  'SiteLink' as software,
  COUNT(*) as account_count
FROM accounts
WHERE vertical LIKE '%SiteLink%'
  AND arr > 0
  AND user_id IN (SELECT id FROM auth.users LIMIT 1);
