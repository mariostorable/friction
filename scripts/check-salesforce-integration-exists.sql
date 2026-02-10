-- Check if Salesforce integration exists for this user
SELECT
  id,
  user_id,
  integration_type,
  status,
  instance_url,
  credentials IS NOT NULL as has_credentials
FROM integrations
WHERE user_id = 'e6d235ad-1cc7-410f-84b4-7cc74bf93b44';
