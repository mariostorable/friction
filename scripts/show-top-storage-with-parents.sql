-- =====================================================================
-- Show top 25 storage accounts WITH parent account address data
-- =====================================================================

WITH top_storage AS (
  SELECT
    id,
    name,
    arr,
    property_address_street,
    property_address_city,
    property_address_state,
    billing_address_street,
    billing_address_city,
    billing_address_state,
    latitude,
    longitude,
    ultimate_parent_id,
    products,
    metadata
  FROM accounts
  WHERE vertical = 'storage'
    AND status = 'active'
  ORDER BY arr DESC NULLS LAST
  LIMIT 25
)
SELECT
  ts.name as account_name,
  ts.arr,

  -- Child account addresses
  ts.property_address_city || ', ' || ts.property_address_state as child_property_addr,
  ts.billing_address_city || ', ' || ts.billing_address_state as child_billing_addr,
  ts.latitude as child_lat,
  ts.longitude as child_lng,

  -- Parent account info
  ts.ultimate_parent_id,
  parent.name as parent_name,
  parent.property_address_city || ', ' || parent.property_address_state as parent_property_addr,
  parent.billing_address_city || ', ' || parent.billing_address_state as parent_billing_addr,
  parent.latitude as parent_lat,
  parent.longitude as parent_lng,

  -- Products and metadata
  ts.products,
  ts.metadata->>'location_name' as location_name
FROM top_storage ts
LEFT JOIN accounts parent ON parent.salesforce_id = ts.ultimate_parent_id
ORDER BY ts.arr DESC NULLS LAST;
