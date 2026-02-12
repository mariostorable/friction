/**
 * Migrate Jira API token from oauth_tokens to encrypted_tokens
 */
import { createClient } from '@supabase/supabase-js';
import { upsertEncryptedToken } from '../lib/encryption';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function migrateJiraToken() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Checking for Jira token in old oauth_tokens table...\n');

  // Get Jira integration
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('integration_type', 'jira')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single();

  if (!integration) {
    console.log('❌ No Jira integration found');
    return;
  }

  console.log('✓ Found Jira integration:', integration.id);

  // Check if already in encrypted_tokens
  const { data: existingToken } = await supabase
    .from('encrypted_tokens')
    .select('id')
    .eq('integration_id', integration.id)
    .single();

  if (existingToken) {
    console.log('✓ Token already in encrypted_tokens table');
    return;
  }

  // Check old oauth_tokens table
  const { data: oldToken } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('integration_id', integration.id)
    .single();

  if (!oldToken) {
    console.log('❌ No token found in oauth_tokens table');
    console.log('\nYou need to generate a new Jira API token and reconnect.');
    return;
  }

  console.log('✓ Found token in old oauth_tokens table');
  console.log('Migrating to encrypted_tokens...\n');

  try {
    const tokenId = await upsertEncryptedToken(supabase, {
      integration_id: integration.id,
      access_token: oldToken.access_token,
      refresh_token: null,
      token_type: 'api_token',
      expires_at: null,
    });

    console.log('✅ Successfully migrated Jira token to encrypted storage');
    console.log(`   Token ID: ${tokenId}`);
    console.log('\nYou can now sync Jira from the dashboard!');
  } catch (error) {
    console.error('❌ Failed to migrate token:', error);
    throw error;
  }
}

migrateJiraToken().catch(console.error);
