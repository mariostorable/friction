-- Check Salesforce integration status
SELECT
  id,
  integration_type,
  status,
  connected_at,
  last_synced_at,
  instance_url,
  error_message
FROM integrations
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND integration_type = 'salesforce'
ORDER BY connected_at DESC;

-- Check if there are any oauth tokens for this integration
SELECT
  id,
  integration_id,
  token_type,
  expires_at,
  created_at,
  updated_at,
  CASE WHEN access_token_encrypted IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as access_token_status,
  CASE WHEN refresh_token_encrypted IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as refresh_token_status
FROM oauth_tokens
WHERE integration_id IN (
  SELECT id FROM integrations
  WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
    AND integration_type = 'salesforce'
)
ORDER BY created_at DESC;
