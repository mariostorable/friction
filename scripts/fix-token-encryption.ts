/**
 * Token Encryption Fix Script
 *
 * This script diagnoses and fixes corrupted OAuth tokens in the database.
 * Run with: npx tsx scripts/fix-token-encryption.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log('🔍 Token Encryption Diagnostic and Fix Tool\n');

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables:');
    if (!supabaseUrl) console.error('  - NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('✓ Environment variables configured');
  console.log(`✓ ENCRYPTION_KEY: ${encryptionKey ? `Set (${encryptionKey.length} chars)` : '❌ NOT SET'}\n`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Step 1: Check encryption status
  console.log('📊 Checking encryption status...\n');

  try {
    const { data: encStatus, error: encError } = await supabase.rpc('check_encryption_status');

    if (encError) {
      throw new Error(`Failed to check encryption status: ${encError.message}`);
    }

    const status = Array.isArray(encStatus) ? encStatus[0] : encStatus;

    console.log('Encryption Status:');
    console.log(`  Total tokens: ${status.total_tokens}`);
    console.log(`  Encrypted access tokens: ${status.encrypted_access_tokens}`);
    console.log(`  Encrypted refresh tokens: ${status.encrypted_refresh_tokens}`);
    console.log(`  Plaintext access tokens: ${status.plaintext_access_tokens}`);
    console.log(`  Plaintext refresh tokens: ${status.plaintext_refresh_tokens}`);
    console.log(`  Encryption percentage: ${status.encryption_percentage}%\n`);

    // Step 2: Find problematic tokens
    const { data: badTokens, error: badError } = await supabase
      .from('oauth_tokens')
      .select(`
        id,
        integration_id,
        token_type,
        created_at,
        updated_at,
        integrations!inner(user_id, integration_type)
      `)
      .is('access_token_encrypted', null);

    if (badError) {
      throw new Error(`Failed to fetch problematic tokens: ${badError.message}`);
    }

    if (!badTokens || badTokens.length === 0) {
      console.log('✅ All tokens are properly encrypted! No action needed.\n');
      rl.close();
      return;
    }

    console.log(`⚠️  Found ${badTokens.length} tokens with NULL encrypted columns:\n`);

    const userIntegrations = new Map<string, Array<{ type: string; tokenId: string }>>();

    badTokens.forEach((token) => {
      const userId = (token.integrations as any).user_id;
      const integrationType = (token.integrations as any).integration_type;

      if (!userIntegrations.has(userId)) {
        userIntegrations.set(userId, []);
      }

      userIntegrations.get(userId)!.push({
        type: integrationType,
        tokenId: token.id,
      });

      console.log(`  - User: ${userId}`);
      console.log(`    Integration: ${integrationType}`);
      console.log(`    Token ID: ${token.id}`);
      console.log(`    Created: ${token.created_at}`);
      console.log(`    Token Type: ${token.token_type}\n`);
    });

    console.log('📋 Summary by User:');
    userIntegrations.forEach((integrations, userId) => {
      const types = integrations.map(i => i.type).join(', ');
      console.log(`  ${userId}: ${types} (${integrations.length} token${integrations.length > 1 ? 's' : ''})`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('🛠️  Fix Options:\n');
    console.log('1. Delete corrupted tokens (users will need to reconnect)');
    console.log('2. Try to re-encrypt plaintext tokens (if they exist)');
    console.log('3. Exit without making changes\n');

    const choice = await question('Enter your choice (1-3): ');

    if (choice === '1') {
      console.log('\n⚠️  WARNING: This will delete the corrupted tokens.');
      console.log('Affected users will need to reconnect their integrations.\n');

      const confirm = await question('Are you sure? Type "yes" to confirm: ');

      if (confirm.toLowerCase() === 'yes') {
        console.log('\n🗑️  Deleting corrupted tokens...');

        const { data: deleted, error: deleteError } = await supabase
          .from('oauth_tokens')
          .delete()
          .is('access_token_encrypted', null)
          .select('id');

        if (deleteError) {
          throw new Error(`Failed to delete tokens: ${deleteError.message}`);
        }

        console.log(`✅ Deleted ${deleted?.length || 0} token(s)\n`);
        console.log('Next steps for affected users:');
        console.log('1. Go to Settings page');
        console.log('2. Reconnect their integrations (Salesforce, Vitally, Jira)\n');

        console.log('Affected users:');
        userIntegrations.forEach((integrations, userId) => {
          const types = integrations.map(i => i.type).join(', ');
          console.log(`  - ${userId} (${types})`);
        });
      } else {
        console.log('❌ Cancelled - no changes made');
      }

    } else if (choice === '2') {
      if (!encryptionKey) {
        console.log('\n❌ Cannot re-encrypt: ENCRYPTION_KEY is not set in environment');
        rl.close();
        return;
      }

      console.log('\n🔐 Attempting to re-encrypt plaintext tokens...');

      const { data: result, error: reEncryptError } = await supabase
        .rpc('encrypt_existing_tokens', { encryption_key: encryptionKey });

      if (reEncryptError) {
        throw new Error(`Re-encryption failed: ${reEncryptError.message}`);
      }

      const encryptResult = Array.isArray(result) ? result[0] : result;

      console.log(`✅ Re-encrypted:`);
      console.log(`  Access tokens: ${encryptResult?.updated_access_tokens || 0}`);
      console.log(`  Refresh tokens: ${encryptResult?.updated_refresh_tokens || 0}\n`);

      if (encryptResult?.updated_access_tokens === 0) {
        console.log('⚠️  No plaintext tokens were found to re-encrypt.');
        console.log('The tokens might have been stored with a different encryption key.');
        console.log('Consider using option 1 to delete and have users reconnect.');
      }

    } else {
      console.log('\n✋ Exiting without making changes');
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  rl.close();
  console.log('\n✅ Done!\n');
}

main().catch(console.error);
