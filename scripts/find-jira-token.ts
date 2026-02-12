/**
 * Find Jira token in old storage
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function findJiraToken() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Looking for Jira integration and tokens...\n');

  // Get all Jira integrations
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('integration_type', 'jira')
    .order('connected_at', { ascending: false });

  if (!integrations || integrations.length === 0) {
    console.log('❌ No Jira integrations found at all');
    return;
  }

  console.log(`Found ${integrations.length} Jira integration(s):\n`);

  for (const integration of integrations) {
    console.log(`Integration ID: ${integration.id}`);
    console.log(`  Status: ${integration.status}`);
    console.log(`  Connected: ${integration.connected_at}`);
    console.log(`  Instance URL: ${integration.instance_url}`);
    console.log(`  User ID: ${integration.user_id}`);

    // Check encrypted_tokens
    const { data: encToken } = await supabase
      .from('encrypted_tokens')
      .select('id')
      .eq('integration_id', integration.id)
      .maybeSingle();

    console.log(`  Encrypted token: ${encToken ? '✓ EXISTS' : '✗ MISSING'}`);

    // Check oauth_tokens
    const { data: oauthToken } = await supabase
      .from('oauth_tokens')
      .select('id, access_token')
      .eq('integration_id', integration.id)
      .maybeSingle();

    if (oauthToken) {
      console.log(`  OAuth token: ✓ EXISTS (${oauthToken.access_token.substring(0, 20)}...)`);
    } else {
      console.log(`  OAuth token: ✗ MISSING`);
    }

    console.log('');
  }
}

findJiraToken().catch(console.error);
