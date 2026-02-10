-- =====================================================================
-- Find storage accounts that HAVE addresses (not corporate)
-- =====================================================================

-- 1. Storage accounts with ANY address data
SELECT
  'Storage Accounts WITH Addresses' as section,
  name,
  arr,
  property_address_city || ', ' || property_address_state as property_addr,
  billing_address_city || ', ' || billing_address_state as billing_addr,
  latitude,
  longitude,
  ultimate_parent_id,
  products
FROM accounts
WHERE vertical = 'storage'
  AND status = 'active'
  AND (
    property_address_city IS NOT NULL
    OR billing_address_city IS NOT NULL
    OR latitude IS NOT NULL
  )
ORDER BY arr DESC NULLS LAST
LIMIT 25;

-- 2. Check if the corporate accounts have child accounts with addresses
SELECT
  'Child Accounts of Top Corps' as section,
  child.name as child_name,
  child.arr as child_arr,
  child.property_address_city || ', ' || child.property_address_state as child_property,
  child.billing_address_city || ', ' || child.billing_address_state as child_billing,
  child.latitude,
  child.longitude,
  child.ultimate_parent_id,
  parent.name as parent_name
FROM accounts child
INNER JOIN accounts parent ON parent.salesforce_id = child.ultimate_parent_id
WHERE child.vertical = 'storage'
  AND child.status = 'active'
  AND parent.name LIKE '%CORP%'
  AND (
    child.property_address_city IS NOT NULL
    OR child.billing_address_city IS NOT NULL
  )
ORDER BY parent.arr DESC NULLS LAST, child.arr DESC NULLS LAST
LIMIT 25;

-- 3. Count address coverage
SELECT
  'Address Coverage Summary' as section,
  COUNT(*) as total_storage_accounts,
  COUNT(CASE WHEN property_address_city IS NOT NULL THEN 1 END) as has_property,
  COUNT(CASE WHEN billing_address_city IS NOT NULL THEN 1 END) as has_billing,
  COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as has_geocode,
  COUNT(CASE WHEN property_address_city IS NULL AND billing_address_city IS NULL THEN 1 END) as no_address,
  COUNT(CASE WHEN name LIKE '%CORP%' THEN 1 END) as is_corporate_account
FROM accounts
WHERE vertical = 'storage'
  AND status = 'active';
