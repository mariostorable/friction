-- Find any accounts with "west" in the name
SELECT 
  name,
  salesforce_id,
  vertical,
  products,
  status
FROM accounts
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND (name ILIKE '%west%' OR name ILIKE '%coast%')
ORDER BY name;
