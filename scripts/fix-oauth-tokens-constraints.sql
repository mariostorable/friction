-- Remove NOT NULL constraints from plaintext token columns
-- since we're now using encrypted columns instead

ALTER TABLE oauth_tokens
  ALTER COLUMN access_token DROP NOT NULL,
  ALTER COLUMN refresh_token DROP NOT NULL;

-- Verify the change
SELECT 
  column_name, 
  is_nullable, 
  data_type
FROM information_schema.columns
WHERE table_name = 'oauth_tokens'
  AND column_name IN ('access_token', 'refresh_token', 'access_token_encrypted', 'refresh_token_encrypted')
ORDER BY column_name;
