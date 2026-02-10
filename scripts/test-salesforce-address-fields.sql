-- =====================================================================
-- Quick check: What address data do we have in the database?
-- =====================================================================
-- This will show us what fields are already being synced
-- =====================================================================

-- 1. Check what address fields have data
SELECT
  'Address Field Usage' as check_name,
  COUNT(*) as total_accounts,
  COUNT(property_address_city) as has_property_address,
  COUNT(billing_address_city) as has_billing_address,
  COUNT(latitude) as has_geocode,
  COUNT(CASE WHEN geocode_source = 'salesforce' THEN 1 END) as geocoded_by_salesforce,
  COUNT(CASE WHEN geocode_source = 'google' THEN 1 END) as geocoded_by_google
FROM accounts
WHERE status = 'active';

-- 2. Sample of accounts showing what address data we have
SELECT
  name,
  vertical,
  property_address_city,
  property_address_state,
  billing_address_city,
  billing_address_state,
  latitude,
  longitude,
  geocode_source,
  metadata->>'location_name' as location_name
FROM accounts
WHERE status = 'active'
ORDER BY arr DESC NULLS LAST
LIMIT 20;

-- 3. Check metadata field for any hidden location info
SELECT
  'Metadata Sample' as check_name,
  name,
  vertical,
  metadata
FROM accounts
WHERE status = 'active'
  AND metadata IS NOT NULL
ORDER BY arr DESC NULLS LAST
LIMIT 5;
