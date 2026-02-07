/**
 * Encryption Utility Module
 *
 * Provides helper functions for column-level encryption of OAuth tokens
 * using Supabase pgcrypto extension (symmetric encryption).
 *
 * Security Notes:
 * - Encryption key stored in ENCRYPTION_KEY environment variable
 * - Only server-side code (API routes) should import this module
 * - Never expose encryption key to client-side code
 * - All encryption/decryption happens in PostgreSQL using pgp_sym_* functions
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Token data structure for encryption operations
 */
export interface TokenData {
  integration_id: string;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_at: string | null;
}

/**
 * Decrypted token structure returned from database
 */
export interface DecryptedToken {
  id: string;
  integration_id: string;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get encryption key from environment variables
 *
 * @throws {Error} If ENCRYPTION_KEY is not set or too short
 * @returns Encryption key string
 */
export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
        'Generate one with: openssl rand -base64 32'
    );
  }

  if (key.length < 32) {
    throw new Error(
      'ENCRYPTION_KEY must be at least 32 characters for security. ' +
        'Current length: ' +
        key.length
    );
  }

  return key;
}

/**
 * Insert or update OAuth token with encryption (UPSERT)
 *
 * Uses PostgreSQL function `insert_encrypted_token` to handle encryption
 * at the database layer. If a token already exists for the integration,
 * it will be updated.
 *
 * @param supabase - Supabase client (must have service role access)
 * @param data - Token data to encrypt and store
 * @returns Token ID if successful
 * @throws {Error} If encryption or database operation fails
 *
 * @example
 * ```typescript
 * const tokenId = await upsertEncryptedToken(supabaseAdmin, {
 *   integration_id: '123e4567-e89b-12d3-a456-426614174000',
 *   access_token: 'salesforce_access_token_here',
 *   refresh_token: 'salesforce_refresh_token_here',
 *   token_type: 'Bearer',
 *   expires_at: '2024-12-31T23:59:59Z'
 * });
 * ```
 */
export async function upsertEncryptedToken(
  supabase: SupabaseClient,
  data: TokenData
): Promise<string> {
  const encryptionKey = getEncryptionKey();

  try {
    const { data: result, error } = await supabase.rpc('insert_encrypted_token', {
      p_integration_id: data.integration_id,
      p_access_token: data.access_token,
      p_refresh_token: data.refresh_token,
      p_token_type: data.token_type,
      p_expires_at: data.expires_at,
      p_encryption_key: encryptionKey,
    });

    if (error) {
      console.error('Failed to upsert encrypted token:', error);
      throw new Error(`Token encryption failed: ${error.message}`);
    }

    if (!result) {
      throw new Error('Token insertion returned no ID');
    }

    console.log('Token stored successfully (encrypted)');
    return result as string;
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

/**
 * Update access token only (for token refresh operations)
 *
 * Used when refreshing Salesforce OAuth tokens. Only updates the
 * access_token and expires_at fields, preserving the refresh_token.
 *
 * @param supabase - Supabase client (must have service role access)
 * @param tokenId - UUID of the token record to update
 * @param accessToken - New access token value
 * @param expiresAt - New expiration timestamp
 * @returns True if update successful
 * @throws {Error} If encryption or database operation fails
 *
 * @example
 * ```typescript
 * await updateEncryptedAccessToken(
 *   supabaseAdmin,
 *   'token-uuid',
 *   'new_access_token',
 *   '2024-12-31T23:59:59Z'
 * );
 * ```
 */
export async function updateEncryptedAccessToken(
  supabase: SupabaseClient,
  tokenId: string,
  accessToken: string,
  expiresAt: string
): Promise<boolean> {
  const encryptionKey = getEncryptionKey();

  try {
    const { data: result, error } = await supabase.rpc('update_encrypted_token', {
      p_token_id: tokenId,
      p_access_token: accessToken,
      p_expires_at: expiresAt,
      p_encryption_key: encryptionKey,
    });

    if (error) {
      console.error('Failed to update encrypted token:', error);
      throw new Error(`Token update failed: ${error.message}`);
    }

    if (!result) {
      console.warn('Token update returned false - token may not exist');
      return false;
    }

    console.log('Token refreshed successfully (encrypted)');
    return result as boolean;
  } catch (error) {
    console.error('Token update error:', error);
    throw error;
  }
}

/**
 * Retrieve and decrypt OAuth token for a given integration
 *
 * Fetches encrypted token from database and decrypts it using the
 * PostgreSQL function `get_decrypted_token`. Returns null if token
 * not found.
 *
 * @param supabase - Supabase client (must have service role access)
 * @param integrationId - UUID of the integration
 * @returns Decrypted token data or null if not found
 * @throws {Error} If decryption fails (wrong key, corrupted data, etc.)
 *
 * @example
 * ```typescript
 * const token = await getDecryptedToken(
 *   supabaseAdmin,
 *   '123e4567-e89b-12d3-a456-426614174000'
 * );
 *
 * if (token) {
 *   // Use token.access_token for API calls
 *   fetch(apiUrl, {
 *     headers: { Authorization: `Bearer ${token.access_token}` }
 *   });
 * }
 * ```
 */
export async function getDecryptedToken(
  supabase: SupabaseClient,
  integrationId: string
): Promise<DecryptedToken | null> {
  const encryptionKey = getEncryptionKey();

  try {
    const { data, error } = await supabase.rpc('get_decrypted_token', {
      p_integration_id: integrationId,
      p_encryption_key: encryptionKey,
    });

    if (error) {
      console.error('Failed to fetch/decrypt token:', error);

      // Provide helpful error messages
      if (error.message.includes('decrypt') || error.message.includes('Wrong key')) {
        throw new Error(
          'Token decryption failed - ENCRYPTION_KEY may be incorrect or changed. ' +
            'Verify the key matches what was used during encryption.'
        );
      }

      throw new Error(`Token retrieval failed: ${error.message}`);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.warn(`No token found for integration: ${integrationId}`);
      return null;
    }

    // RPC returns an array, get first item
    const token = Array.isArray(data) ? data[0] : data;

    // Validate decrypted token structure
    if (!token.access_token) {
      console.error('Token validation failed:', {
        integration_id: integrationId,
        has_token: !!token,
        token_fields: token ? Object.keys(token) : [],
        access_token_value: token?.access_token,
        token_type: token?.token_type,
      });

      throw new Error(
        `Decrypted token is missing access_token - data may be corrupted. ` +
        `Integration ID: ${integrationId}. ` +
        `This usually means: (1) the ENCRYPTION_KEY has changed, or ` +
        `(2) the token was stored without encryption. ` +
        `Run the /api/admin/fix-tokens endpoint to diagnose and fix.`
      );
    }

    return token as DecryptedToken;
  } catch (error) {
    console.error('Token decryption error:', error);
    throw error;
  }
}

/**
 * Check encryption status of oauth_tokens table
 *
 * Utility function to verify encryption migration status.
 * Returns statistics about encrypted vs plaintext tokens.
 *
 * @param supabase - Supabase client (must have service role access)
 * @returns Encryption status statistics
 *
 * @example
 * ```typescript
 * const status = await checkEncryptionStatus(supabaseAdmin);
 * console.log(`Encryption rate: ${status.encryption_percentage}%`);
 * ```
 */
export async function checkEncryptionStatus(supabase: SupabaseClient): Promise<{
  total_tokens: number;
  encrypted_access_tokens: number;
  encrypted_refresh_tokens: number;
  plaintext_access_tokens: number;
  plaintext_refresh_tokens: number;
  encryption_percentage: number;
}> {
  try {
    const { data, error } = await supabase.rpc('check_encryption_status');

    if (error) {
      console.error('Failed to check encryption status:', error);
      throw new Error(`Encryption status check failed: ${error.message}`);
    }

    // RPC returns an array with one result
    const status = Array.isArray(data) ? data[0] : data;

    return {
      total_tokens: Number(status.total_tokens || 0),
      encrypted_access_tokens: Number(status.encrypted_access_tokens || 0),
      encrypted_refresh_tokens: Number(status.encrypted_refresh_tokens || 0),
      plaintext_access_tokens: Number(status.plaintext_access_tokens || 0),
      plaintext_refresh_tokens: Number(status.plaintext_refresh_tokens || 0),
      encryption_percentage: Number(status.encryption_percentage || 0),
    };
  } catch (error) {
    console.error('Encryption status check error:', error);
    throw error;
  }
}
