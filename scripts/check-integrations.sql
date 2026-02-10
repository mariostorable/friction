-- Check what integrations exist
SELECT
  id,
  user_id,
  provider,
  instance_url,
  credentials->>'access_token' as has_access_token,
  created_at
FROM integrations
WHERE provider = 'salesforce';
