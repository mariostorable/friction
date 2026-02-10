-- =====================================================================
-- Check if Property Address fields are now populated after sync
-- =====================================================================

SELECT
  name,
  arr,
  -- Property addresses (should now be populated!)
  property_address_street,
  property_address_city,
  property_address_state,
  property_address_postal_code,
  -- Geocodes
  latitude,
  longitude,
  geocode_source,
  -- Check if it's a corporate parent
  CASE
    WHEN name LIKE '%CORP%' OR name LIKE '% - C' OR name LIKE '%- C' THEN 'Yes'
    ELSE 'No'
  END as is_corporate_parent
FROM accounts
WHERE vertical = 'storage'
  AND status = 'active'
ORDER BY arr DESC NULLS LAST
LIMIT 25;
