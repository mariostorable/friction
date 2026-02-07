/**
 * Check Sync Status Script
 *
 * Verifies which users can and cannot sync
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  console.log('🔍 Checking Salesforce Sync Status\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all Salesforce integrations
  const { data: integrations, error: intError } = await supabase
    .from('integrations')
    .select('id, user_id, integration_type, status, connected_at, last_synced_at')
    .eq('integration_type', 'salesforce')
    .order('connected_at', { ascending: false });

  if (intError) {
    console.error('❌ Failed to fetch integrations:', intError.message);
    process.exit(1);
  }

  if (!integrations || integrations.length === 0) {
    console.log('ℹ️  No Salesforce integrations found');
    return;
  }

  console.log(`Found ${integrations.length} Salesforce integration(s):\n`);

  // Check which ones have tokens
  const integrationStatuses = [];

  for (const integration of integrations) {
    const { data: tokens, error: tokenError } = await supabase
      .from('oauth_tokens')
      .select('id, token_type, created_at')
      .eq('integration_id', integration.id)
      .maybeSingle();

    const hasToken = !!tokens;
    const status = integration.status === 'active' ? '✅ Active' : '⚠️  Inactive';
    const tokenStatus = hasToken ? '✅ Has Token' : '❌ Missing Token';

    console.log(`User: ${integration.user_id.substring(0, 8)}...`);
    console.log(`  Status: ${status}`);
    console.log(`  Token: ${tokenStatus}`);
    console.log(`  Connected: ${integration.connected_at}`);
    console.log(`  Last Synced: ${integration.last_synced_at || 'Never'}`);

    if (!hasToken) {
      console.log(`  🔧 Action Required: User needs to reconnect Salesforce`);
    }

    console.log('');

    integrationStatuses.push({ integration, hasToken });
  }

  const needsReconnect = integrationStatuses.filter(s => !s.hasToken).map(s => s.integration);

  console.log('📊 Summary:');
  console.log(`  Total integrations: ${integrations.length}`);
  console.log(`  Active: ${integrations.filter(i => i.status === 'active').length}`);
  console.log(`  Needs reconnect: ${needsReconnect.length}\n`);

  if (needsReconnect.length > 0) {
    console.log('⚠️  These users cannot sync until they reconnect:');
    needsReconnect.forEach(int => {
      console.log(`  - ${int.user_id}`);
    });
  } else {
    console.log('✅ All users have valid tokens and can sync!');
  }
}

main().catch(console.error);
