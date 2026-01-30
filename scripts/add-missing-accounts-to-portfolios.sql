-- ================================================================
-- Add missing accounts to portfolios so cron can process them
-- ================================================================

-- STEP 1: Identify accounts that aren't in any portfolio
-- Marine accounts (based on name patterns)
WITH marine_accounts AS (
  SELECT id, name
  FROM accounts
  WHERE (
    name ILIKE '%marine%'
    OR name ILIKE '%boat%'
    OR name ILIKE '%yacht%'
    OR name ILIKE '%recreational realty%'
  )
  AND status NOT IN ('cancelled', 'churned')
  AND id NOT IN (
    SELECT unnest(account_ids)
    FROM portfolios
    WHERE portfolio_type IN ('top_25_edge', 'top_25_sitelink', 'top_25_marine')
  )
),

-- Storage accounts not in any portfolio (assume Edge by default)
storage_accounts AS (
  SELECT id, name, products
  FROM accounts
  WHERE status NOT IN ('cancelled', 'churned')
  AND id NOT IN (
    SELECT unnest(account_ids)
    FROM portfolios
    WHERE portfolio_type IN ('top_25_edge', 'top_25_sitelink', 'top_25_marine')
  )
  AND name NOT ILIKE '%marine%'
  AND name NOT ILIKE '%boat%'
  AND name NOT ILIKE '%yacht%'
  AND name NOT ILIKE '%recreational realty%'
)

SELECT
  'Marine Accounts (add to top_25_marine):' as category,
  count(*) as count,
  array_agg(id) as account_ids
FROM marine_accounts

UNION ALL

SELECT
  'Storage Accounts - Edge (add to top_25_edge):' as category,
  count(*) as count,
  array_agg(id) as account_ids
FROM storage_accounts
WHERE products ILIKE '%storEDGE%' OR products IS NULL

UNION ALL

SELECT
  'Storage Accounts - SiteLink (add to top_25_sitelink):' as category,
  count(*) as count,
  array_agg(id) as account_ids
FROM storage_accounts
WHERE products ILIKE '%sitelink%' AND products NOT ILIKE '%storEDGE%';


-- ================================================================
-- STEP 2: Add accounts to portfolios
-- IMPORTANT: Replace USER_ID with your actual user ID from the query above
-- ================================================================

-- First, get your user_id from existing portfolios:
-- SELECT DISTINCT user_id FROM portfolios WHERE portfolio_type = 'top_25_edge' LIMIT 1;

-- Example: If your user_id is 'ab953672-7bad-4601-9289-5d766e73fec9'

-- Add Marine accounts to top_25_marine portfolio
-- UPDATE portfolios
-- SET account_ids = account_ids || ARRAY[
--   '7f5693ab-9bf0-4f23-abed-22e716b20a1e'::uuid,  -- MarineMax
--   '58bdb5b7-5ed4-4628-ad2b-44bc529ce99d'::uuid,  -- Nautical Boat Club
--   '059f1013-f04f-4034-ab68-2388e7b5fe82'::uuid   -- Recreational Realty
--   -- Add more marine account IDs here
-- ]
-- WHERE user_id = 'YOUR_USER_ID_HERE' AND portfolio_type = 'top_25_marine';


-- Add Edge accounts to top_25_edge portfolio
-- UPDATE portfolios
-- SET account_ids = account_ids || ARRAY[
--   'cb88e63b-d572-4199-8cb6-c56f92acc260'::uuid,  -- Sandlian Management
--   '3ec3a661-48e4-42e5-96d5-a814466bcd59'::uuid,  -- Make Space Storage
--   -- Add more storage account IDs here (see STEP 1 results)
-- ]
-- WHERE user_id = 'YOUR_USER_ID_HERE' AND portfolio_type = 'top_25_edge';


-- ================================================================
-- STEP 3: Verify accounts were added
-- ================================================================

SELECT
  portfolio_type,
  array_length(account_ids, 1) as num_accounts
FROM portfolios
WHERE user_id = 'YOUR_USER_ID_HERE'
ORDER BY portfolio_type;

-- You should see the account counts increase

-- ================================================================
-- STEP 4: Test that cron will now pick up these accounts
-- ================================================================

-- Check which accounts need analysis
SELECT
  a.name,
  a.id,
  CASE
    WHEN a.id = ANY(
      SELECT unnest(account_ids) FROM portfolios WHERE portfolio_type IN ('top_25_edge', 'top_25_sitelink', 'top_25_marine')
    ) THEN 'In Portfolio ✓'
    ELSE 'NOT in portfolio ✗'
  END as portfolio_status,
  s.snapshot_date as last_analyzed
FROM accounts a
LEFT JOIN LATERAL (
  SELECT snapshot_date
  FROM account_snapshots
  WHERE account_id = a.id
  ORDER BY snapshot_date DESC
  LIMIT 1
) s ON true
WHERE a.status NOT IN ('cancelled', 'churned')
ORDER BY s.snapshot_date ASC NULLS FIRST
LIMIT 35;

-- After adding accounts to portfolios, all accounts should show "In Portfolio ✓"
