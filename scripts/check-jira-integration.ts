/**
 * Check Jira integration status
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkJiraIntegration() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Checking Jira integration...\n');

  // Get user
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1).single();

  if (!profiles) {
    console.log('No user found');
    return;
  }

  // Get Jira integration
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', profiles.id)
    .eq('integration_type', 'jira')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.log('❌ No Jira integration found');
    console.log('Error:', error.message);
    return;
  }

  console.log('✓ Jira integration found:');
  console.log(`  ID: ${integration.id}`);
  console.log(`  Status: ${integration.status}`);
  console.log(`  Connected at: ${integration.connected_at}`);
  console.log(`  Last synced: ${integration.last_synced_at || 'Never'}`);
  console.log(`  Instance URL: ${integration.instance_url}`);
  console.log('');

  // Check for encrypted tokens
  const { data: tokens, error: tokenError } = await supabase
    .from('encrypted_tokens')
    .select('id, created_at, expires_at')
    .eq('integration_id', integration.id)
    .single();

  if (tokenError) {
    console.log('❌ No encrypted tokens found');
    console.log('Error:', tokenError.message);
    console.log('\nAction needed: Reconnect Jira from Settings');
  } else {
    console.log('✓ Encrypted tokens found:');
    console.log(`  Token ID: ${tokens.id}`);
    console.log(`  Created: ${tokens.created_at}`);
    console.log(`  Expires: ${tokens.expires_at || 'No expiration'}`);
  }
}

checkJiraIntegration().catch(console.error);
