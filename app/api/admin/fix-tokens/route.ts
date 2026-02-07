import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Admin endpoint to fix corrupted or NULL encrypted tokens
 *
 * This endpoint:
 * 1. Identifies tokens with NULL encrypted columns
 * 2. Optionally deletes them (forcing users to reconnect)
 * 3. Optionally tries to re-encrypt if plaintext tokens exist
 */
export async function POST(request: NextRequest) {
  // Simple authentication check
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action } = await request.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (action === 'diagnose') {
      // Just diagnose the issue
      const { data: encStatus, error: encError } = await supabase.rpc('check_encryption_status');

      if (encError) {
        throw new Error(`Encryption status check failed: ${encError.message}`);
      }

      const status = Array.isArray(encStatus) ? encStatus[0] : encStatus;

      // Get details of problematic tokens
      const { data: badTokens, error: badError } = await supabase
        .from('oauth_tokens')
        .select(`
          id,
          integration_id,
          token_type,
          created_at,
          integrations!inner(user_id, integration_type)
        `)
        .is('access_token_encrypted', null);

      if (badError) {
        throw new Error(`Failed to fetch bad tokens: ${badError.message}`);
      }

      return NextResponse.json({
        success: true,
        action: 'diagnose',
        encryption_status: status,
        problem_tokens: badTokens?.map(t => ({
          id: t.id,
          integration_id: t.integration_id,
          user_id: (t.integrations as any).user_id,
          integration_type: (t.integrations as any).integration_type,
          token_type: t.token_type,
          created_at: t.created_at,
        })) || [],
        recommendation: badTokens && badTokens.length > 0
          ? 'Delete these tokens and have users reconnect their integrations'
          : 'All tokens appear to be properly encrypted'
      });

    } else if (action === 'delete_null_tokens') {
      // Delete tokens with NULL encrypted columns
      const { data: deletedTokens, error: deleteError } = await supabase
        .from('oauth_tokens')
        .delete()
        .is('access_token_encrypted', null)
        .select('id, integration_id');

      if (deleteError) {
        throw new Error(`Failed to delete tokens: ${deleteError.message}`);
      }

      return NextResponse.json({
        success: true,
        action: 'delete_null_tokens',
        deleted_count: deletedTokens?.length || 0,
        deleted_token_ids: deletedTokens?.map(t => t.id) || [],
        message: 'Deleted tokens with NULL encrypted columns. Users will need to reconnect their integrations.'
      });

    } else if (action === 're_encrypt_plaintext') {
      // Try to re-encrypt any plaintext tokens
      const encryptionKey = process.env.ENCRYPTION_KEY;

      if (!encryptionKey) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
      }

      const { data: result, error: reEncryptError } = await supabase
        .rpc('encrypt_existing_tokens', { encryption_key: encryptionKey });

      if (reEncryptError) {
        throw new Error(`Re-encryption failed: ${reEncryptError.message}`);
      }

      const encryptResult = Array.isArray(result) ? result[0] : result;

      return NextResponse.json({
        success: true,
        action: 're_encrypt_plaintext',
        updated_access_tokens: encryptResult?.updated_access_tokens || 0,
        updated_refresh_tokens: encryptResult?.updated_refresh_tokens || 0,
        message: 'Re-encrypted plaintext tokens'
      });

    } else {
      return NextResponse.json({
        error: 'Invalid action. Use: diagnose, delete_null_tokens, or re_encrypt_plaintext'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Token fix failed:', error);
    return NextResponse.json({
      error: 'Failed to fix tokens',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
