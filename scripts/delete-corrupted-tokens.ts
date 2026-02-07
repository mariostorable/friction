/**
 * Delete Corrupted Tokens Script
 *
 * Deletes OAuth tokens with NULL encrypted columns.
 * Run with: npx tsx scripts/delete-corrupted-tokens.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  console.log('🗑️  Deleting corrupted OAuth tokens\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Find tokens to delete
  const { data: badTokens, error: fetchError } = await supabase
    .from('oauth_tokens')
    .select(`
      id,
      integration_id,
      token_type,
      integrations!inner(user_id, integration_type)
    `)
    .is('access_token_encrypted', null);

  if (fetchError) {
    console.error('❌ Failed to fetch tokens:', fetchError.message);
    process.exit(1);
  }

  if (!badTokens || badTokens.length === 0) {
    console.log('✅ No corrupted tokens found!');
    return;
  }

  console.log(`Found ${badTokens.length} corrupted token(s):\n`);

  const affectedUsers = new Set<string>();
  badTokens.forEach((token) => {
    const userId = (token.integrations as any).user_id;
    const integrationType = (token.integrations as any).integration_type;
    affectedUsers.add(userId);
    console.log(`  - User: ${userId.substring(0, 8)}...`);
    console.log(`    Integration: ${integrationType}`);
    console.log(`    Token ID: ${token.id}\n`);
  });

  // Delete the tokens
  const { data: deleted, error: deleteError } = await supabase
    .from('oauth_tokens')
    .delete()
    .is('access_token_encrypted', null)
    .select('id');

  if (deleteError) {
    console.error('❌ Failed to delete tokens:', deleteError.message);
    process.exit(1);
  }

  console.log(`✅ Successfully deleted ${deleted?.length || 0} token(s)\n`);

  console.log('📋 Next Steps:');
  console.log(`\n${affectedUsers.size} user(s) need to reconnect their integrations:`);
  affectedUsers.forEach(userId => {
    console.log(`  - ${userId}`);
  });

  console.log('\nInstructions for affected users:');
  console.log('1. Log in to the application');
  console.log('2. Go to Settings');
  console.log('3. Click "Connect" next to their Salesforce integration');
  console.log('4. Complete OAuth flow\n');

  console.log('✅ Done! The analyze-portfolio cron will resume for these users after they reconnect.\n');
}

main().catch(console.error);
