-- =====================================================================
-- Check metadata for any hidden address data
-- =====================================================================

SELECT
  name,
  arr,
  -- Show what we have in standard fields
  property_address_city as prop_city,
  billing_address_city as bill_city,
  -- Show the full metadata JSON (might contain corporate address)
  metadata
FROM accounts
WHERE vertical = 'storage'
  AND status = 'active'
  AND name LIKE '%CORP%'
ORDER BY arr DESC NULLS LAST
LIMIT 10;
