-- ================================================================
-- ENCRYPTION ROLLBACK SCRIPT
-- Purpose: Rollback column-level encryption if migration fails
-- WARNING: Use only in case of emergency or failed migration
-- ================================================================

/*
WHEN TO USE THIS SCRIPT:

1. Migration failed and tokens are corrupted
2. Wrong encryption key was used
3. Application cannot decrypt tokens after deployment
4. Critical production issue requiring immediate fix

PREREQUISITES:

- You must have the ENCRYPTION_KEY that was used to encrypt tokens
- Ideally, restore from Supabase backup first, then use this as last resort
- Test on a development/staging environment before production

*/

-- ================================================================
-- PHASE 1: Verify current state
-- ================================================================

-- Check current token status
SELECT
  COUNT(*) as total_tokens,
  COUNT(*) FILTER (WHERE access_token IS NOT NULL) as plaintext_tokens,
  COUNT(*) FILTER (WHERE access_token_encrypted IS NOT NULL) as encrypted_tokens
FROM oauth_tokens;

-- ================================================================
-- PHASE 2: Restore plaintext columns if needed
-- ================================================================

-- Add back plaintext columns (if they were dropped)
ALTER TABLE oauth_tokens
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token TEXT;

-- ================================================================
-- PHASE 3: Decrypt tokens back to plaintext
-- ================================================================

-- Decrypt access tokens back to plaintext
-- IMPORTANT: Replace 'YOUR-ENCRYPTION-KEY' with the actual key
UPDATE oauth_tokens
SET
  access_token = pgp_sym_decrypt(access_token_encrypted, 'YOUR-ENCRYPTION-KEY')::TEXT
WHERE access_token_encrypted IS NOT NULL
  AND (access_token IS NULL OR access_token = '');

-- Decrypt refresh tokens back to plaintext
-- IMPORTANT: Replace 'YOUR-ENCRYPTION-KEY' with the actual key
UPDATE oauth_tokens
SET
  refresh_token = pgp_sym_decrypt(refresh_token_encrypted, 'YOUR-ENCRYPTION-KEY')::TEXT
WHERE refresh_token_encrypted IS NOT NULL
  AND (refresh_token IS NULL OR refresh_token = '');

-- ================================================================
-- PHASE 4: Verify decryption worked
-- ================================================================

-- Check that tokens were decrypted
SELECT
  COUNT(*) as total_tokens,
  COUNT(*) FILTER (WHERE access_token IS NOT NULL) as restored_access_tokens,
  COUNT(*) FILTER (WHERE refresh_token IS NOT NULL) as restored_refresh_tokens,
  COUNT(*) FILTER (WHERE access_token_encrypted IS NOT NULL) as still_encrypted
FROM oauth_tokens;

-- Sample decrypted tokens (verify they look correct)
SELECT
  id,
  integration_id,
  LEFT(access_token, 20) || '...' as access_token_preview,
  token_type,
  expires_at
FROM oauth_tokens
LIMIT 5;

-- ================================================================
-- PHASE 5: Drop encrypted columns
-- ================================================================

-- Remove encrypted columns
ALTER TABLE oauth_tokens
  DROP COLUMN IF EXISTS access_token_encrypted,
  DROP COLUMN IF EXISTS refresh_token_encrypted;

-- ================================================================
-- PHASE 6: Drop helper functions
-- ================================================================

-- Remove encryption functions
DROP FUNCTION IF EXISTS insert_encrypted_token(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS update_encrypted_token(UUID, TEXT, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS get_decrypted_token(UUID, TEXT);
DROP FUNCTION IF EXISTS encrypt_existing_tokens(TEXT);
DROP FUNCTION IF EXISTS check_encryption_status();

-- ================================================================
-- PHASE 7: Final verification
-- ================================================================

-- Verify table structure is back to original
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'oauth_tokens'
ORDER BY ordinal_position;

-- Verify all functions are removed
SELECT routine_name
FROM information_schema.routines
WHERE routine_name LIKE '%encrypt%'
  AND routine_schema = 'public';

-- ================================================================
-- POST-ROLLBACK STEPS
-- ================================================================

/*
AFTER RUNNING THIS ROLLBACK:

1. VERIFY INTEGRATIONS WORK:
   - Test Salesforce connection and sync
   - Test Jira connection and sync
   - Verify tokens are working in plaintext

2. REVERT APPLICATION CODE:
   - git revert to previous commit (before encryption changes)
   - Deploy reverted code to production
   - Verify API routes work with plaintext tokens

3. INVESTIGATE ROOT CAUSE:
   - Check logs for specific error messages
   - Verify encryption key was correct
   - Test migration in development/staging
   - Fix issues before re-attempting

4. DOCUMENT INCIDENT:
   - Record what went wrong
   - Document recovery steps taken
   - Update migration plan based on lessons learned

5. OPTIONAL - Retry migration:
   - Once issue is identified and fixed
   - Test thoroughly in dev/staging
   - Create new backup before re-attempting
   - Execute corrected migration script

*/

-- ================================================================
-- EMERGENCY CONTACT INFO
-- ================================================================

/*
If rollback fails or you need assistance:

1. Contact Supabase Support via dashboard
2. Restore from most recent backup (Supabase Dashboard → Database → Backups)
3. Check #support channel in Supabase Discord
4. Review Supabase docs: https://supabase.com/docs/guides/database/postgres

*/
