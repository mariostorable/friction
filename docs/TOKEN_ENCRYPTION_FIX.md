# Token Encryption Issue - Diagnostic and Fix Guide

## Problem Description

You're seeing errors like:
```
Token decryption error: Error: Decrypted token is missing access_token - data may be corrupted
Failed to decrypt tokens for user {user-id}
```

This occurs when tokens stored in the `oauth_tokens` table cannot be properly decrypted.

## Root Causes

1. **Encryption Key Changed**: The `ENCRYPTION_KEY` environment variable in production doesn't match the key used to encrypt the tokens
2. **Incomplete Migration**: Tokens were saved but the `access_token_encrypted` column is NULL
3. **Missing Encryption**: Tokens were stored before encryption was implemented

## Diagnostic Steps

### Step 1: Check Encryption Status

Run the diagnostic SQL script:

```bash
psql $DATABASE_URL -f scripts/diagnose-token-encryption.sql
```

Or use the API endpoint:

```bash
curl -X GET https://your-app.com/api/debug/check-tokens \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

This will show:
- How many tokens exist
- How many are properly encrypted
- Which users are affected

### Step 2: Verify Environment Variables

Check that `ENCRYPTION_KEY` is set in your production environment:

```bash
# Should be at least 32 characters
echo ${#ENCRYPTION_KEY}
```

If the key is missing or too short, generate a new one:

```bash
openssl rand -base64 32
```

## Fix Options

### Option 1: Delete NULL Tokens (Recommended)

This forces affected users to reconnect their integrations.

**Using SQL:**
```sql
DELETE FROM oauth_tokens WHERE access_token_encrypted IS NULL;
```

**Using API:**
```bash
curl -X POST https://your-app.com/api/admin/fix-tokens \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"action": "delete_null_tokens"}'
```

**Affected users:** The 3 users in your error logs:
- 4c66a44c-5dcf-4b35-91cf-4dd9f6ac0d6e
- 32c43ddc-b5a8-4868-a42b-1a40e93b2c34
- 029d2fec-13fb-4ef7-a40a-6f96b3a963a5

After deletion, these users will need to:
1. Go to Settings
2. Reconnect their Salesforce/Vitally/Jira integrations

### Option 2: Re-encrypt Plaintext Tokens

If plaintext tokens still exist in the database:

**Using SQL:**
```sql
-- Replace with your actual encryption key
SELECT * FROM encrypt_existing_tokens('YOUR-ENCRYPTION-KEY');
```

**Using API:**
```bash
curl -X POST https://your-app.com/api/admin/fix-tokens \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"action": "re_encrypt_plaintext"}'
```

### Option 3: Encryption Key Rotation (If Key Changed)

If the encryption key was lost or changed:

1. **Back up the database first**
2. Delete all existing tokens:
   ```sql
   DELETE FROM oauth_tokens;
   ```
3. Set the new `ENCRYPTION_KEY` in your environment
4. Have all users reconnect their integrations

## Preventing Future Issues

1. **Never change the ENCRYPTION_KEY** once set in production
2. **Store the key securely** in a secrets manager (e.g., AWS Secrets Manager, Vercel Environment Variables)
3. **Backup the key** in a secure location separate from the database
4. **Test encryption/decryption** after any deployment:
   ```bash
   curl -X POST https://your-app.com/api/admin/fix-tokens \
     -H "Authorization: Bearer ${CRON_SECRET}" \
     -H "Content-Type: application/json" \
     -d '{"action": "diagnose"}'
   ```

## Quick Fix Commands

For the current issue, run this command to diagnose:

```bash
curl -X POST https://your-production-url.com/api/admin/fix-tokens \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"action": "diagnose"}'
```

Then delete the problematic tokens:

```bash
curl -X POST https://your-production-url.com/api/admin/fix-tokens \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"action": "delete_null_tokens"}'
```

## Impact

The `analyze-portfolio` cron job will continue to work for other users. The 3 affected users will:
- Not have their accounts analyzed until they reconnect
- Not see new friction cards or OFI updates
- Need to manually reconnect their Salesforce integration

After fixing, the cron job will resume analyzing their accounts normally.

## Support

If you need help, check:
1. [lib/encryption.ts](../lib/encryption.ts) - Encryption implementation
2. [scripts/add-token-encryption.sql](../scripts/add-token-encryption.sql) - Database functions
3. [app/api/admin/fix-tokens/route.ts](../app/api/admin/fix-tokens/route.ts) - Fix utility
