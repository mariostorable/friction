-- =====================================================================
-- Check what the latest sync pulled for top storage accounts
-- =====================================================================

SELECT
  name,
  arr,
  -- Standard addresses (we know these are NULL)
  property_address_city as prop_city,
  property_address_state as prop_state,
  billing_address_city as bill_city,
  billing_address_state as bill_state,
  -- Geocodes
  latitude,
  longitude,
  geocode_source,
  -- Check metadata for any address data
  metadata->>'industry' as industry,
  metadata->>'type' as type,
  metadata->>'location_name' as location_name,
  -- Show full metadata to see if corporate address is buried in there
  jsonb_pretty(metadata) as metadata_formatted
FROM accounts
WHERE vertical = 'storage'
  AND status = 'active'
ORDER BY arr DESC NULLS LAST
LIMIT 5;
