-- ================================================================
-- Diagnose why storage portfolios aren't being created
-- Mario's user_id: ab953672-7bad-4601-9289-5d766e73fec9
-- ================================================================

-- Query 1: Total storage accounts by status
SELECT
  'Total Storage Accounts by Status' as query,
  status,
  COUNT(*) as count
FROM accounts
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND vertical = 'storage'
GROUP BY status
ORDER BY count DESC;

-- Query 2: Storage accounts with products field analysis
SELECT
  'Storage Accounts Products Analysis' as query,
  CASE
    WHEN products IS NULL THEN 'NULL products'
    WHEN products = '' THEN 'Empty string products'
    WHEN trim(products) = '' THEN 'Whitespace only products'
    WHEN products LIKE '%Software%' OR products LIKE '%EDGE%' OR products LIKE '%SiteLink%' THEN 'Has Software/EDGE/SiteLink'
    ELSE 'Other products value'
  END as products_category,
  COUNT(*) as count
FROM accounts
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND vertical = 'storage'
  AND status = 'active'
  AND NOT (name ILIKE '%test%')
GROUP BY products_category
ORDER BY count DESC;

-- Query 3: Sample of products field values for storage accounts
SELECT
  'Sample Storage Account Products' as query,
  name,
  status,
  products,
  arr
FROM accounts
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND vertical = 'storage'
  AND status = 'active'
  AND NOT (name ILIKE '%test%')
ORDER BY arr DESC NULLS LAST
LIMIT 20;

-- Query 4: How many storage accounts match the portfolio filter criteria?
SELECT
  'Storage Accounts Matching Portfolio Filter' as query,
  COUNT(*) as count
FROM accounts
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND vertical = 'storage'
  AND status = 'active'
  AND NOT (name ILIKE '%test%')
  AND products IS NOT NULL
  AND trim(products) != ''
  AND (products LIKE '%Software%' OR products LIKE '%EDGE%' OR products LIKE '%SiteLink%');

-- Query 5: Check current portfolios for this user
SELECT
  'Current Portfolios' as query,
  portfolio_type,
  array_length(account_ids, 1) as account_count,
  created_at,
  updated_at
FROM portfolios
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
ORDER BY portfolio_type;
