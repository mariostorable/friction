-- =====================================================================
-- Show all address data for top 25 storage accounts
-- =====================================================================

SELECT
  name,
  arr,
  -- Property Address (from ShippingAddress)
  property_address_street as prop_street,
  property_address_city as prop_city,
  property_address_state as prop_state,
  property_address_postal_code as prop_zip,
  -- Billing Address
  billing_address_street as bill_street,
  billing_address_city as bill_city,
  billing_address_state as bill_state,
  billing_address_postal_code as bill_zip,
  -- Geocode info
  latitude as lat,
  longitude as lng,
  geocode_source as geo_source,
  -- Parent account info
  ultimate_parent_id as parent_id,
  -- Other data
  products,
  -- Raw metadata (might contain location_name or other address info)
  metadata->>'location_name' as location_name,
  metadata->>'type' as sf_type
FROM accounts
WHERE vertical = 'storage'
  AND status = 'active'
ORDER BY arr DESC NULLS LAST
LIMIT 25;
