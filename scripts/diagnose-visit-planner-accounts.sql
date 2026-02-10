-- =====================================================================
-- DIAGNOSE: Visit Planner Account Issues
-- =====================================================================

-- 1. Check total accounts with geocodes by vertical
SELECT
  '1️⃣ Accounts with Geocodes by Vertical' as check_name,
  vertical,
  COUNT(*) as total_accounts,
  COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as geocoded_accounts,
  ROUND(AVG(arr)::numeric, 0) as avg_arr
FROM accounts
WHERE status = 'active'
GROUP BY vertical
ORDER BY geocoded_accounts DESC;

-- 2. Check top 10 storage accounts by ARR - are they geocoded?
SELECT
  '2️⃣ Top 10 Storage Accounts' as check_name,
  name,
  arr,
  vertical,
  property_address_city,
  property_address_state,
  latitude IS NOT NULL as has_geocode,
  products
FROM accounts
WHERE vertical = 'storage' AND status = 'active'
ORDER BY arr DESC NULLS LAST
LIMIT 10;

-- 3. Check address data quality
SELECT
  '3️⃣ Address Data Quality' as check_name,
  COUNT(*) as total_active_accounts,
  COUNT(CASE WHEN property_address_city IS NOT NULL THEN 1 END) as has_property_address,
  COUNT(CASE WHEN billing_address_city IS NOT NULL THEN 1 END) as has_billing_address,
  COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as has_geocode,
  COUNT(CASE WHEN products IS NOT NULL AND products != '' THEN 1 END) as has_products
FROM accounts
WHERE status = 'active';

-- 4. Sample accounts showing up in Visit Planner near Austin, TX
SELECT
  '4️⃣ Accounts Near Austin TX (50mi)' as check_name,
  name,
  vertical,
  arr,
  latitude,
  longitude,
  property_address_city,
  property_address_state,
  products,
  -- Calculate distance from Austin (30.2672, -97.7431)
  (
    3959 * acos(
      cos(radians(30.2672)) *
      cos(radians(latitude)) *
      cos(radians(longitude) - radians(-97.7431)) +
      sin(radians(30.2672)) *
      sin(radians(latitude))
    )
  )::DECIMAL as distance_miles
FROM accounts
WHERE status = 'active'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND (
    3959 * acos(
      cos(radians(30.2672)) *
      cos(radians(latitude)) *
      cos(radians(longitude) - radians(-97.7431)) +
      sin(radians(30.2672)) *
      sin(radians(latitude))
    )
  ) <= 50
ORDER BY distance_miles
LIMIT 20;

-- 5. Check if marine accounts have higher geocode rates than storage
SELECT
  '5️⃣ Geocode Rate Comparison' as check_name,
  vertical,
  COUNT(*) as total,
  COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as geocoded,
  ROUND(100.0 * COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1) as geocode_percentage
FROM accounts
WHERE status = 'active'
GROUP BY vertical
ORDER BY geocode_percentage DESC;
