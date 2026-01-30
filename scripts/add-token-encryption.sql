-- ================================================================
-- COLUMN-LEVEL ENCRYPTION MIGRATION SCRIPT
-- Purpose: Add pgcrypto-based encryption to oauth_tokens table
-- ================================================================

-- ================================================================
-- PHASE 1: Enable pgcrypto and add encrypted columns
-- ================================================================

-- Enable pgcrypto extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add new encrypted columns to oauth_tokens table
ALTER TABLE oauth_tokens
  ADD COLUMN IF NOT EXISTS access_token_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted BYTEA;

COMMENT ON COLUMN oauth_tokens.access_token_encrypted IS 'Encrypted access token using pgp_sym_encrypt';
COMMENT ON COLUMN oauth_tokens.refresh_token_encrypted IS 'Encrypted refresh token using pgp_sym_encrypt';

-- ================================================================
-- PHASE 2: Encryption helper function
-- ================================================================

-- Function to encrypt existing plaintext tokens
-- NOTE: Call this function with your ENCRYPTION_KEY after adding columns
-- Example: SELECT encrypt_existing_tokens('your-encryption-key-here');
CREATE OR REPLACE FUNCTION encrypt_existing_tokens(encryption_key TEXT)
RETURNS TABLE(
  updated_access_tokens INTEGER,
  updated_refresh_tokens INTEGER
) AS $$
DECLARE
  access_count INTEGER := 0;
  refresh_count INTEGER := 0;
BEGIN
  -- Encrypt existing access_tokens that haven't been encrypted yet
  UPDATE oauth_tokens
  SET access_token_encrypted = pgp_sym_encrypt(access_token, encryption_key)
  WHERE access_token IS NOT NULL
    AND access_token_encrypted IS NULL;

  GET DIAGNOSTICS access_count = ROW_COUNT;

  -- Encrypt existing refresh_tokens that haven't been encrypted yet
  UPDATE oauth_tokens
  SET refresh_token_encrypted = pgp_sym_encrypt(refresh_token, encryption_key)
  WHERE refresh_token IS NOT NULL
    AND refresh_token_encrypted IS NULL;

  GET DIAGNOSTICS refresh_count = ROW_COUNT;

  RETURN QUERY SELECT access_count, refresh_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION encrypt_existing_tokens IS 'Migrates plaintext tokens to encrypted format - call once after adding encrypted columns';

-- ================================================================
-- PHASE 3: Helper functions for insert/update/retrieve
-- ================================================================

-- Function to insert or update encrypted token (UPSERT)
CREATE OR REPLACE FUNCTION insert_encrypted_token(
  p_integration_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_token_type TEXT,
  p_expires_at TIMESTAMPTZ,
  p_encryption_key TEXT
)
RETURNS UUID AS $$
DECLARE
  v_token_id UUID;
BEGIN
  INSERT INTO oauth_tokens (
    integration_id,
    access_token_encrypted,
    refresh_token_encrypted,
    token_type,
    expires_at,
    created_at,
    updated_at
  ) VALUES (
    p_integration_id,
    pgp_sym_encrypt(p_access_token, p_encryption_key),
    CASE
      WHEN p_refresh_token IS NOT NULL
      THEN pgp_sym_encrypt(p_refresh_token, p_encryption_key)
      ELSE NULL
    END,
    p_token_type,
    p_expires_at,
    NOW(),
    NOW()
  )
  ON CONFLICT (integration_id)
  DO UPDATE SET
    access_token_encrypted = pgp_sym_encrypt(p_access_token, p_encryption_key),
    refresh_token_encrypted = CASE
      WHEN p_refresh_token IS NOT NULL
      THEN pgp_sym_encrypt(p_refresh_token, p_encryption_key)
      ELSE oauth_tokens.refresh_token_encrypted
    END,
    token_type = p_token_type,
    expires_at = p_expires_at,
    updated_at = NOW()
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION insert_encrypted_token IS 'Inserts or updates OAuth token with encryption (UPSERT)';

-- Function to update access token only (for refresh operations)
CREATE OR REPLACE FUNCTION update_encrypted_token(
  p_token_id UUID,
  p_access_token TEXT,
  p_expires_at TIMESTAMPTZ,
  p_encryption_key TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE oauth_tokens
  SET
    access_token_encrypted = pgp_sym_encrypt(p_access_token, p_encryption_key),
    expires_at = p_expires_at,
    updated_at = NOW()
  WHERE id = p_token_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_encrypted_token IS 'Updates access token and expiration (for token refresh)';

-- Function to retrieve and decrypt tokens
CREATE OR REPLACE FUNCTION get_decrypted_token(
  p_integration_id UUID,
  p_encryption_key TEXT
)
RETURNS TABLE(
  id UUID,
  integration_id UUID,
  access_token TEXT,
  refresh_token TEXT,
  token_type TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.integration_id,
    CASE
      WHEN t.access_token_encrypted IS NOT NULL
      THEN pgp_sym_decrypt(t.access_token_encrypted, p_encryption_key)::TEXT
      ELSE NULL
    END AS access_token,
    CASE
      WHEN t.refresh_token_encrypted IS NOT NULL
      THEN pgp_sym_decrypt(t.refresh_token_encrypted, p_encryption_key)::TEXT
      ELSE NULL
    END AS refresh_token,
    t.token_type,
    t.expires_at,
    t.created_at,
    t.updated_at
  FROM oauth_tokens t
  WHERE t.integration_id = p_integration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_decrypted_token IS 'Retrieves and decrypts OAuth token for given integration';

-- ================================================================
-- PHASE 4: Verification and status check function
-- ================================================================

-- Function to check encryption status
CREATE OR REPLACE FUNCTION check_encryption_status()
RETURNS TABLE(
  total_tokens BIGINT,
  encrypted_access_tokens BIGINT,
  encrypted_refresh_tokens BIGINT,
  plaintext_access_tokens BIGINT,
  plaintext_refresh_tokens BIGINT,
  encryption_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_tokens,
    COUNT(*) FILTER (WHERE access_token_encrypted IS NOT NULL)::BIGINT as encrypted_access,
    COUNT(*) FILTER (WHERE refresh_token_encrypted IS NOT NULL)::BIGINT as encrypted_refresh,
    COUNT(*) FILTER (WHERE access_token IS NOT NULL AND access_token_encrypted IS NULL)::BIGINT as plaintext_access,
    COUNT(*) FILTER (WHERE refresh_token IS NOT NULL AND refresh_token_encrypted IS NULL)::BIGINT as plaintext_refresh,
    ROUND(
      (COUNT(*) FILTER (WHERE access_token_encrypted IS NOT NULL)::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0)) * 100,
      2
    ) as encryption_percentage
  FROM oauth_tokens;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_encryption_status IS 'Returns encryption status report for oauth_tokens table';

-- ================================================================
-- VERIFICATION QUERIES (Run after migration)
-- ================================================================

-- Check encryption status
-- Usage: SELECT * FROM check_encryption_status();

-- Verify encrypted columns exist
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'oauth_tokens'
--   AND column_name IN ('access_token_encrypted', 'refresh_token_encrypted');

-- Test decryption on sample token (replace 'your-key' with actual key)
-- SELECT id, integration_id,
--   pgp_sym_decrypt(access_token_encrypted, 'your-key')::TEXT as decrypted_access_token
-- FROM oauth_tokens
-- WHERE access_token_encrypted IS NOT NULL
-- LIMIT 1;

-- ================================================================
-- MIGRATION EXECUTION INSTRUCTIONS
-- ================================================================

/*
STEP-BY-STEP MIGRATION INSTRUCTIONS:

1. CREATE BACKUP FIRST:
   - Go to Supabase Dashboard → Database → Backups → Create Manual Backup
   - Document current token count: SELECT COUNT(*) FROM oauth_tokens;

2. RUN THIS MIGRATION SCRIPT:
   - Execute this entire SQL file in Supabase SQL Editor
   - Verify no errors returned

3. ENCRYPT EXISTING TOKENS:
   - Replace 'YOUR-ENCRYPTION-KEY' with your actual key from environment
   - Run: SELECT * FROM encrypt_existing_tokens('YOUR-ENCRYPTION-KEY');
   - Expected output: Shows number of tokens encrypted

4. VERIFY ENCRYPTION WORKED:
   - Run: SELECT * FROM check_encryption_status();
   - Expected: encryption_percentage should be 100%

5. TEST DECRYPTION (IMPORTANT):
   - Replace 'YOUR-ENCRYPTION-KEY' with actual key
   - Run: SELECT * FROM get_decrypted_token('some-integration-id', 'YOUR-ENCRYPTION-KEY');
   - Expected: Should return decrypted token successfully

6. DEPLOY APPLICATION CODE:
   - Deploy the updated API routes that use encryption functions
   - Monitor logs for any decryption errors

7. OPTIONAL - DROP OLD PLAINTEXT COLUMNS (after verifying everything works):
   - Wait 7 days to ensure no issues
   - Run: ALTER TABLE oauth_tokens DROP COLUMN IF EXISTS access_token, DROP COLUMN IF EXISTS refresh_token;

NOTE: Keep the encryption key secure! If lost, tokens cannot be decrypted.
*/
