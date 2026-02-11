-- ================================================================
-- Fix: Add active Storage accounts to portfolios
-- This will make them show up in the Dashboard's Storage Accounts table
-- ================================================================

-- Replace with your user_id
\set USER_ID 'e6d235ad-1cc7-410f-84b4-7cc74bf93b44'

-- ================================================================
-- STEP 1: Create portfolios if they don't exist
-- ================================================================
DO $$
DECLARE
  v_user_id UUID := 'e6d235ad-1cc7-410f-84b4-7cc74bf93b44';
BEGIN
  -- Create top_25_edge portfolio if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM portfolios
    WHERE user_id = v_user_id AND portfolio_type = 'top_25_edge'
  ) THEN
    INSERT INTO portfolios (user_id, name, portfolio_type, account_ids)
    VALUES (v_user_id, 'Top 25 EDGE Accounts', 'top_25_edge', ARRAY[]::UUID[]);
    RAISE NOTICE 'Created top_25_edge portfolio';
  END IF;

  -- Create top_25_sitelink portfolio if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM portfolios
    WHERE user_id = v_user_id AND portfolio_type = 'top_25_sitelink'
  ) THEN
    INSERT INTO portfolios (user_id, name, portfolio_type, account_ids)
    VALUES (v_user_id, 'Top 25 SiteLink Accounts', 'top_25_sitelink', ARRAY[]::UUID[]);
    RAISE NOTICE 'Created top_25_sitelink portfolio';
  END IF;
END $$;

-- ================================================================
-- STEP 2: Add EDGE accounts to top_25_edge portfolio
-- ================================================================
WITH edge_accounts AS (
  SELECT ARRAY_AGG(DISTINCT id) as account_ids
  FROM accounts
  WHERE user_id = :'USER_ID'
    AND status = 'active'
    AND vertical = 'storage'
    AND (
      products ILIKE '%storEDGE%'
      OR products IS NULL  -- Assume EDGE if no products specified
    )
    AND id NOT IN (
      SELECT unnest(account_ids)
      FROM portfolios
      WHERE user_id = :'USER_ID' AND portfolio_type = 'top_25_edge'
    )
)
UPDATE portfolios
SET account_ids = account_ids || COALESCE((SELECT account_ids FROM edge_accounts), ARRAY[]::UUID[])
WHERE user_id = :'USER_ID'
  AND portfolio_type = 'top_25_edge'
  AND (SELECT account_ids FROM edge_accounts) IS NOT NULL;

-- ================================================================
-- STEP 3: Add SiteLink accounts to top_25_sitelink portfolio
-- ================================================================
WITH sitelink_accounts AS (
  SELECT ARRAY_AGG(DISTINCT id) as account_ids
  FROM accounts
  WHERE user_id = :'USER_ID'
    AND status = 'active'
    AND vertical = 'storage'
    AND products ILIKE '%sitelink%'
    AND id NOT IN (
      SELECT unnest(account_ids)
      FROM portfolios
      WHERE user_id = :'USER_ID' AND portfolio_type = 'top_25_sitelink'
    )
)
UPDATE portfolios
SET account_ids = account_ids || COALESCE((SELECT account_ids FROM sitelink_accounts), ARRAY[]::UUID[])
WHERE user_id = :'USER_ID'
  AND portfolio_type = 'top_25_sitelink'
  AND (SELECT account_ids FROM sitelink_accounts) IS NOT NULL;

-- ================================================================
-- STEP 4: Verify the fix
-- ================================================================
SELECT
  'Results' as step,
  portfolio_type,
  array_length(account_ids, 1) as account_count
FROM portfolios
WHERE user_id = :'USER_ID'
  AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
ORDER BY portfolio_type;

-- ================================================================
-- STEP 5: Show which accounts are now in portfolios
-- ================================================================
SELECT
  'Accounts in EDGE Portfolio' as portfolio,
  a.name,
  a.arr,
  a.products
FROM accounts a
WHERE a.id IN (
  SELECT unnest(account_ids)
  FROM portfolios
  WHERE user_id = :'USER_ID' AND portfolio_type = 'top_25_edge'
)
ORDER BY a.arr DESC NULLS LAST;

SELECT
  'Accounts in SiteLink Portfolio' as portfolio,
  a.name,
  a.arr,
  a.products
FROM accounts a
WHERE a.id IN (
  SELECT unnest(account_ids)
  FROM portfolios
  WHERE user_id = :'USER_ID' AND portfolio_type = 'top_25_sitelink'
)
ORDER BY a.arr DESC NULLS LAST;
