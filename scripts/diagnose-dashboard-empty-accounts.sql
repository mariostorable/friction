-- ================================================================
-- Diagnose why Storage Accounts table shows 0 of 0 accounts
-- Run this in Supabase SQL Editor
-- ================================================================

-- Replace with your user_id
\set USER_ID 'e6d235ad-1cc7-410f-84b4-7cc74bf93b44'

-- ================================================================
-- STEP 1: Check if portfolios exist
-- ================================================================
SELECT
  '1. Portfolio Check' as step,
  portfolio_type,
  name,
  array_length(account_ids, 1) as account_count,
  created_at
FROM portfolios
WHERE user_id = :'USER_ID'
  AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
ORDER BY portfolio_type;

-- ================================================================
-- STEP 2: Check account status distribution
-- ================================================================
SELECT
  '2. Account Status' as step,
  status,
  COUNT(*) as count
FROM accounts
WHERE user_id = :'USER_ID'
GROUP BY status
ORDER BY count DESC;

-- ================================================================
-- STEP 3: Check active Storage accounts not in portfolios
-- ================================================================
SELECT
  '3. Active Storage Accounts NOT in Portfolios' as step,
  COUNT(*) as missing_accounts
FROM accounts a
WHERE a.user_id = :'USER_ID'
  AND a.status = 'active'
  AND a.vertical = 'storage'
  AND a.id NOT IN (
    SELECT unnest(account_ids)
    FROM portfolios
    WHERE user_id = :'USER_ID'
      AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
  );

-- ================================================================
-- STEP 4: Show sample active Storage accounts
-- ================================================================
SELECT
  '4. Sample Active Storage Accounts' as step,
  a.name,
  a.arr,
  a.products,
  a.vertical,
  a.status,
  CASE
    WHEN a.id = ANY(
      SELECT unnest(account_ids)
      FROM portfolios
      WHERE user_id = :'USER_ID' AND portfolio_type = 'top_25_edge'
    ) THEN 'In EDGE portfolio'
    WHEN a.id = ANY(
      SELECT unnest(account_ids)
      FROM portfolios
      WHERE user_id = :'USER_ID' AND portfolio_type = 'top_25_sitelink'
    ) THEN 'In SiteLink portfolio'
    ELSE 'NOT in any portfolio'
  END as portfolio_status
FROM accounts a
WHERE a.user_id = :'USER_ID'
  AND a.status = 'active'
  AND a.vertical = 'storage'
ORDER BY a.arr DESC NULLS LAST
LIMIT 10;

-- ================================================================
-- STEP 5: Check accounts by software type
-- ================================================================
SELECT
  '5. Accounts by Software Type' as step,
  CASE
    WHEN products ILIKE '%storEDGE%' AND products ILIKE '%sitelink%' THEN 'Both EDGE & SiteLink'
    WHEN products ILIKE '%storEDGE%' THEN 'EDGE Only'
    WHEN products ILIKE '%sitelink%' THEN 'SiteLink Only'
    ELSE 'Unknown/No products'
  END as software_type,
  status,
  COUNT(*) as count
FROM accounts
WHERE user_id = :'USER_ID'
  AND vertical = 'storage'
GROUP BY software_type, status
ORDER BY count DESC;

-- ================================================================
-- STEP 6: Recommended Actions
-- ================================================================
SELECT
  '6. Recommended Action' as step,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM portfolios
      WHERE user_id = :'USER_ID'
        AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
    ) THEN 'ISSUE: Portfolios do not exist. They should be created during account sync.'
    WHEN (
      SELECT SUM(array_length(account_ids, 1))
      FROM portfolios
      WHERE user_id = :'USER_ID'
        AND portfolio_type IN ('top_25_edge', 'top_25_sitelink')
    ) = 0 THEN 'ISSUE: Portfolios exist but are empty. Run add-missing-accounts-to-portfolios.sql'
    WHEN NOT EXISTS (
      SELECT 1 FROM accounts
      WHERE user_id = :'USER_ID' AND status = 'active' AND vertical = 'storage'
    ) THEN 'ISSUE: All accounts are cancelled or not in storage vertical.'
    ELSE 'OK: Portfolios exist and have accounts. Check dashboard filters.'
  END as diagnosis
FROM (SELECT 1) as dummy;
