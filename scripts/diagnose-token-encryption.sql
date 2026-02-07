-- ================================================================
-- TOKEN ENCRYPTION DIAGNOSTIC SCRIPT
-- Purpose: Identify and fix token encryption issues
-- ================================================================

-- STEP 1: Check overall encryption status
SELECT * FROM check_encryption_status();

-- STEP 2: Find tokens with NULL encrypted columns
SELECT
  t.id,
  t.integration_id,
  i.user_id,
  i.integration_type,
  t.token_type,
  CASE WHEN t.access_token_encrypted IS NULL THEN 'NULL' ELSE 'ENCRYPTED' END as access_status,
  CASE WHEN t.refresh_token_encrypted IS NULL THEN 'NULL' ELSE 'ENCRYPTED' END as refresh_status,
  CASE WHEN t.access_token IS NOT NULL THEN 'HAS_PLAINTEXT' ELSE 'NO_PLAINTEXT' END as plaintext_status,
  t.created_at,
  t.updated_at
FROM oauth_tokens t
JOIN integrations i ON i.id = t.integration_id
WHERE t.access_token_encrypted IS NULL
ORDER BY t.updated_at DESC;

-- STEP 3: Check if there are any plaintext tokens that need encryption
SELECT
  COUNT(*) as plaintext_tokens_needing_encryption
FROM oauth_tokens
WHERE access_token IS NOT NULL
  AND access_token_encrypted IS NULL;

-- STEP 4: Check specific problem users (from error logs)
SELECT
  i.user_id,
  i.integration_type,
  t.id as token_id,
  CASE WHEN t.access_token_encrypted IS NULL THEN 'NULL' ELSE 'ENCRYPTED' END as access_status,
  CASE WHEN t.refresh_token_encrypted IS NULL THEN 'NULL' ELSE 'ENCRYPTED' END as refresh_status,
  t.token_type,
  t.created_at,
  t.updated_at
FROM integrations i
JOIN oauth_tokens t ON t.integration_id = i.id
WHERE i.user_id IN (
  '4c66a44c-5dcf-4b35-91cf-4dd9f6ac0d6e',
  '32c43ddc-b5a8-4868-a42b-1a40e93b2c34',
  '029d2fec-13fb-4ef7-a40a-6f96b3a963a5'
);

-- ================================================================
-- FIX OPTIONS
-- ================================================================

-- OPTION 1: Delete tokens with NULL encrypted columns
-- This will force users to reconnect their integrations
-- UNCOMMENT TO RUN:
/*
DELETE FROM oauth_tokens
WHERE access_token_encrypted IS NULL;
*/

-- OPTION 2: If plaintext tokens exist, encrypt them
-- Replace 'YOUR-ENCRYPTION-KEY' with actual key from environment
-- UNCOMMENT TO RUN:
/*
SELECT * FROM encrypt_existing_tokens('YOUR-ENCRYPTION-KEY');
*/

-- OPTION 3: Check if decryption works for existing tokens
-- Replace 'YOUR-ENCRYPTION-KEY' and 'INTEGRATION-ID' with actual values
-- UNCOMMENT TO RUN:
/*
SELECT * FROM get_decrypted_token('INTEGRATION-ID', 'YOUR-ENCRYPTION-KEY');
*/

-- ================================================================
-- VALIDATION QUERIES
-- ================================================================

-- After fixing, verify all tokens are encrypted
SELECT
  COUNT(*) as total_tokens,
  COUNT(*) FILTER (WHERE access_token_encrypted IS NOT NULL) as encrypted_tokens,
  COUNT(*) FILTER (WHERE access_token_encrypted IS NULL) as null_tokens
FROM oauth_tokens;

-- Check integrations affected
SELECT
  i.integration_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE t.access_token_encrypted IS NOT NULL) as encrypted,
  COUNT(*) FILTER (WHERE t.access_token_encrypted IS NULL) as needs_fix
FROM integrations i
LEFT JOIN oauth_tokens t ON t.integration_id = i.id
GROUP BY i.integration_type;
