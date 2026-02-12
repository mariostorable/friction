-- Create encrypted_tokens table for secure OAuth token storage
-- This replaces the old oauth_tokens table with encrypted storage

CREATE TABLE IF NOT EXISTS encrypted_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  access_token_encrypted BYTEA NOT NULL,
  refresh_token_encrypted BYTEA,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(integration_id)
);

-- Enable RLS
ALTER TABLE encrypted_tokens ENABLE ROW LEVEL SECURITY;

-- Service role can manage all tokens
CREATE POLICY "Service role can manage encrypted tokens"
  ON encrypted_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create or replace function to insert/update encrypted tokens
CREATE OR REPLACE FUNCTION insert_encrypted_token(
  p_integration_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_token_type TEXT,
  p_expires_at TIMESTAMPTZ,
  p_encryption_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_id UUID;
BEGIN
  -- Upsert the encrypted token
  INSERT INTO encrypted_tokens (
    integration_id,
    access_token_encrypted,
    refresh_token_encrypted,
    token_type,
    expires_at,
    updated_at
  )
  VALUES (
    p_integration_id,
    pgp_sym_encrypt(p_access_token, p_encryption_key),
    CASE WHEN p_refresh_token IS NOT NULL
      THEN pgp_sym_encrypt(p_refresh_token, p_encryption_key)
      ELSE NULL
    END,
    p_token_type,
    p_expires_at,
    NOW()
  )
  ON CONFLICT (integration_id) DO UPDATE SET
    access_token_encrypted = pgp_sym_encrypt(p_access_token, p_encryption_key),
    refresh_token_encrypted = CASE WHEN p_refresh_token IS NOT NULL
      THEN pgp_sym_encrypt(p_refresh_token, p_encryption_key)
      ELSE encrypted_tokens.refresh_token_encrypted
    END,
    token_type = p_token_type,
    expires_at = p_expires_at,
    updated_at = NOW()
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

-- Create function to get decrypted token
CREATE OR REPLACE FUNCTION get_decrypted_token(
  p_integration_id UUID,
  p_encryption_key TEXT
)
RETURNS TABLE (
  id UUID,
  integration_id UUID,
  access_token TEXT,
  refresh_token TEXT,
  token_type TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    et.id,
    et.integration_id,
    pgp_sym_decrypt(et.access_token_encrypted, p_encryption_key)::TEXT as access_token,
    CASE WHEN et.refresh_token_encrypted IS NOT NULL
      THEN pgp_sym_decrypt(et.refresh_token_encrypted, p_encryption_key)::TEXT
      ELSE NULL
    END as refresh_token,
    et.token_type,
    et.expires_at,
    et.created_at,
    et.updated_at
  FROM encrypted_tokens et
  WHERE et.integration_id = p_integration_id;
END;
$$;

-- Create function to update only access token (for token refresh)
CREATE OR REPLACE FUNCTION update_encrypted_access_token(
  p_token_id UUID,
  p_access_token TEXT,
  p_expires_at TIMESTAMPTZ,
  p_encryption_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE encrypted_tokens
  SET
    access_token_encrypted = pgp_sym_encrypt(p_access_token, p_encryption_key),
    expires_at = p_expires_at,
    updated_at = NOW()
  WHERE id = p_token_id;

  RETURN FOUND;
END;
$$;

-- Migrate data from oauth_tokens to encrypted_tokens (if oauth_tokens exists and has data)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_tokens') THEN
    -- This is a one-time migration - in production, you'll need to run this manually
    -- with the actual encryption key, or have users reconnect their integrations
    RAISE NOTICE 'oauth_tokens table exists - manual migration required for existing tokens';
    RAISE NOTICE 'Existing users will need to reconnect their Salesforce integration';
  END IF;
END $$;
