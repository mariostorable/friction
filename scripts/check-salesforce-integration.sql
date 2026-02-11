-- Check Salesforce integration status
SELECT
  id,
  integration_type,
  status,
  connected_at,
  instance_url,
  created_at,
  updated_at,
  -- Don't show encrypted tokens for security
  CASE WHEN encrypted_access_token IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as access_token_status,
  CASE WHEN encrypted_refresh_token IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as refresh_token_status
FROM integrations
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND integration_type = 'salesforce'
ORDER BY connected_at DESC;

-- Check if there are any oauth tokens
SELECT
  id,
  integration_id,
  token_type,
  expires_at,
  created_at,
  updated_at,
  CASE WHEN encrypted_access_token IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as token_status
FROM oauth_tokens
WHERE integration_id IN (
  SELECT id FROM integrations
  WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
    AND integration_type = 'salesforce'
)
ORDER BY created_at DESC;
