-- Find which user has Salesforce connected
SELECT
  id,
  user_id,
  integration_type,
  status,
  instance_url
FROM integrations
WHERE integration_type = 'salesforce';
