-- ================================================================
-- Check what vertical values Mario's accounts have
-- ================================================================

-- Mario's user_id
WITH mario AS (
  SELECT 'ab953672-7bad-4601-9289-5d766e73fec9'::uuid as user_id
)

-- Query 1: Vertical distribution across all accounts
SELECT
  'Vertical Distribution' as query,
  vertical,
  status,
  COUNT(*) as count
FROM accounts
WHERE user_id = (SELECT user_id FROM mario)
GROUP BY vertical, status
ORDER BY count DESC;

-- Query 2: Sample of accounts in portfolios
SELECT
  'Sample Accounts in Portfolios' as query,
  a.name,
  a.vertical,
  a.status,
  a.products,
  a.arr
FROM accounts a
WHERE a.user_id = (SELECT user_id FROM mario)
  AND a.id IN (
    SELECT unnest(account_ids)
    FROM portfolios
    WHERE user_id = (SELECT user_id FROM mario)
      AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
  )
ORDER BY a.arr DESC NULLS LAST
LIMIT 20;

-- Query 3: Are there accounts with NULL or unexpected vertical values?
SELECT
  'Accounts with NULL or unexpected verticals' as query,
  vertical,
  COUNT(*) as count,
  array_agg(name ORDER BY arr DESC NULLS LAST) FILTER (WHERE arr IS NOT NULL) AS top_accounts
FROM accounts
WHERE user_id = (SELECT user_id FROM mario)
  AND status = 'active'
  AND (vertical IS NULL OR vertical NOT IN ('storage', 'marine'))
GROUP BY vertical;
