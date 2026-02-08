-- Check which accounts have Salesforce IDs
-- Run this in Supabase SQL Editor

SELECT
  id,
  name,
  salesforce_id,
  CASE
    WHEN salesforce_id IS NOT NULL THEN 'Has SF ID'
    ELSE 'No SF ID - Cannot sync cases'
  END as status
FROM accounts
WHERE name LIKE '%Crescendo%'
ORDER BY name;

-- Also check how many accounts have Salesforce IDs overall
SELECT
  COUNT(*) as total_accounts,
  COUNT(salesforce_id) as accounts_with_sf_id,
  COUNT(*) - COUNT(salesforce_id) as accounts_without_sf_id
FROM accounts;
