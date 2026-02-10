-- Check what's in the Top 25 Storage portfolio
WITH portfolio_accounts AS (
  SELECT
    a.id,
    a.name,
    a.products,
    a.arr,
    a.vertical
  FROM accounts a
  JOIN portfolios p ON a.id = ANY(p.account_ids)
  WHERE p.portfolio_type = 'top_25_edge'
  ORDER BY a.arr DESC
)
SELECT
  COUNT(*) as total_accounts,
  COUNT(*) FILTER (WHERE products LIKE '%EDGE%') as with_edge,
  COUNT(*) FILTER (WHERE products LIKE '%SiteLink%') as with_sitelink,
  COUNT(*) FILTER (WHERE products IS NULL OR (products NOT LIKE '%EDGE%' AND products NOT LIKE '%SiteLink%')) as with_neither
FROM portfolio_accounts;

-- Show sample accounts
SELECT name, products, arr, vertical
FROM accounts a
JOIN portfolios p ON a.id = ANY(p.account_ids)
WHERE p.portfolio_type = 'top_25_edge'
ORDER BY arr DESC
LIMIT 10;
