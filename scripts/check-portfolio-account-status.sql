-- Check status of accounts in portfolios
WITH portfolio_accounts AS (
  SELECT DISTINCT unnest(account_ids) as account_id
  FROM portfolios
  WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
    AND portfolio_type IN ('top_25_edge', 'top_25_sitelink', 'top_25_marine')
)
SELECT
  status,
  COUNT(*) as count
FROM accounts
WHERE id IN (SELECT account_id FROM portfolio_accounts)
GROUP BY status
ORDER BY count DESC;
