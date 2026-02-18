import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function diagnose() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Diagnosing Jira Sync Failure ===\n');

  // Check if Jira integration exists
  const { data: integration, error: intError } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('integration_type', 'jira')
    .eq('status', 'active')
    .single();

  if (intError || !integration) {
    console.log('❌ No active Jira integration found');
    console.log('   Error:', intError?.message || 'No integration');
    console.log('\n   Solution: Connect Jira in Settings');
    return;
  }

  console.log('✓ Jira integration exists');
  console.log(`  ID: ${integration.id}`);
  console.log(`  Status: ${integration.status}`);
  console.log(`  Connected: ${integration.connected_at}`);
  console.log(`  Last synced: ${integration.last_synced_at || 'Never'}`);

  // Check if there are any Jira issues in database
  const { data: issues, count } = await supabase
    .from('jira_issues')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  console.log(`\n✓ Jira issues in database: ${count || 0}`);

  if (count === 0) {
    console.log('   ⚠️  No issues found - this is why the roadmap is empty');
    console.log('   The sync may have failed to fetch from Jira API');
  }

  // Check theme_jira_links
  const { count: themeLinkCount } = await supabase
    .from('theme_jira_links')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  console.log(`\n✓ Theme-Jira links: ${themeLinkCount || 0}`);

  // Check account_jira_links
  const { count: accountLinkCount } = await supabase
    .from('account_jira_links')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  console.log(`✓ Account-Jira links: ${accountLinkCount || 0}`);

  // Check if tokens exist
  const { data: tokens } = await supabase
    .from('integration_tokens')
    .select('id, expires_at')
    .eq('integration_id', integration.id)
    .single();

  if (!tokens) {
    console.log('\n❌ No integration tokens found');
    console.log('   Solution: Reconnect Jira in Settings');
    return;
  }

  console.log('\n✓ Integration tokens exist');
  console.log(`  Token ID: ${tokens.id}`);
  console.log(`  Expires: ${tokens.expires_at}`);

  const expiresAt = new Date(tokens.expires_at);
  const now = new Date();
  if (expiresAt < now) {
    console.log('  ⚠️  Token expired - needs refresh');
  }

  // Check recent sync logs from Vercel
  console.log('\n💡 Next Steps:');
  console.log('1. Check Vercel logs for the sync endpoint:');
  console.log('   https://vercel.com/your-project/logs');
  console.log('2. Look for /api/jira/sync POST requests');
  console.log('3. Check for errors in the response');
  console.log('\nPossible issues:');
  console.log('- Jira OAuth token expired (needs reconnect)');
  console.log('- Jira API rate limit');
  console.log('- Network/connection error to Jira');
  console.log('- JQL query returning 0 results');
}

diagnose().catch(console.error);
