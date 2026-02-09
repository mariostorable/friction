-- Diagnostic query to understand account data issues

-- 1. Count accounts by vertical
SELECT
  'Accounts by Vertical' as category,
  COALESCE(vertical, 'NULL') as value,
  COUNT(*) as count
FROM accounts
WHERE status = 'active'
GROUP BY vertical
ORDER BY count DESC;

-- 2. Sample accounts without vertical
SELECT
  'Sample Accounts with NULL Vertical' as info,
  name,
  segment as salesforce_type,
  arr,
  products
FROM accounts
WHERE status = 'active'
  AND vertical IS NULL
ORDER BY arr DESC NULLS LAST
LIMIT 10;

-- 3. Geocoding coverage
SELECT
  'Geocoding Status' as category,
  CASE
    WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 'Has Coordinates'
    WHEN property_address_city IS NOT NULL THEN 'Has Address (No Coords)'
    WHEN billing_address_city IS NOT NULL THEN 'Has Billing Only'
    ELSE 'No Location Data'
  END as status,
  COUNT(*) as count
FROM accounts
WHERE status = 'active'
GROUP BY
  CASE
    WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 'Has Coordinates'
    WHEN property_address_city IS NOT NULL THEN 'Has Address (No Coords)'
    WHEN billing_address_city IS NOT NULL THEN 'Has Billing Only'
    ELSE 'No Location Data'
  END
ORDER BY count DESC;

-- 4. Sample accounts with addresses but no coords
SELECT
  'Accounts with Address but No Geocoding' as info,
  name,
  property_address_city,
  property_address_state,
  billing_address_city,
  billing_address_state,
  geocode_source,
  geocode_quality
FROM accounts
WHERE status = 'active'
  AND (property_address_city IS NOT NULL OR billing_address_city IS NOT NULL)
  AND latitude IS NULL
LIMIT 10;

-- 5. Top ARR accounts by vertical
SELECT
  COALESCE(vertical, 'NULL') as vertical,
  COUNT(*) as count,
  ROUND(AVG(arr)::numeric, 0) as avg_arr,
  ROUND(SUM(arr)::numeric, 0) as total_arr
FROM accounts
WHERE status = 'active'
  AND arr IS NOT NULL
GROUP BY vertical
ORDER BY total_arr DESC;
