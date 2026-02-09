-- Check how many accounts have geocoding data for Visit Planner

-- Total accounts
SELECT 'Total Accounts' as metric, COUNT(*) as count
FROM accounts
WHERE status = 'active'

UNION ALL

-- Accounts with lat/lng
SELECT 'Accounts with Coordinates' as metric, COUNT(*) as count
FROM accounts
WHERE status = 'active'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL

UNION ALL

-- Accounts with property address
SELECT 'Accounts with Property Address' as metric, COUNT(*) as count
FROM accounts
WHERE status = 'active'
  AND property_address_city IS NOT NULL
  AND property_address_state IS NOT NULL

UNION ALL

-- Accounts with billing address
SELECT 'Accounts with Billing Address' as metric, COUNT(*) as count
FROM accounts
WHERE status = 'active'
  AND billing_address_city IS NOT NULL
  AND billing_address_state IS NOT NULL

UNION ALL

-- Top ARR accounts with coordinates
SELECT 'Top 50 ARR with Coordinates' as metric, COUNT(*) as count
FROM (
  SELECT *
  FROM accounts
  WHERE status = 'active'
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND arr IS NOT NULL
  ORDER BY arr DESC
  LIMIT 50
) sub;

-- Show sample accounts with coordinates by state
SELECT
  property_address_state as state,
  property_address_city as city,
  COUNT(*) as accounts_with_coords,
  ROUND(AVG(arr)::numeric, 0) as avg_arr
FROM accounts
WHERE status = 'active'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND property_address_state IS NOT NULL
GROUP BY property_address_state, property_address_city
ORDER BY accounts_with_coords DESC
LIMIT 20;
