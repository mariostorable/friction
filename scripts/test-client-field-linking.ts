import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testClientFieldLinking() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Testing Client Field Linking Logic ===\n');

  // Get tickets with customfield_12184
  const { data: tickets } = await supabase
    .from('jira_issues')
    .select('id, jira_key, summary, metadata')
    .eq('user_id', userId)
    .not('metadata->custom_fields->customfield_12184', 'is', null)
    .limit(10);

  console.log(`Testing with ${tickets?.length || 0} tickets\n`);

  // Get all active accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active');

  console.log(`Available accounts: ${accounts?.length || 0}\n`);

  // Simulate the linking logic
  const potentialLinks: any[] = [];

  for (const ticket of tickets || []) {
    const customFields = ticket.metadata?.custom_fields || {};
    const clientFieldValue = customFields['customfield_12184'];

    if (clientFieldValue && typeof clientFieldValue === 'string') {
      const clientNames = clientFieldValue.split(',').map(name => name.trim()).filter(name => name.length > 0);

      console.log(`\n${ticket.jira_key}: ${ticket.summary.substring(0, 60)}...`);
      console.log(`  Client(s) field: ${clientFieldValue}`);
      console.log(`  Parsed clients: ${clientNames.join(', ')}`);

      for (const clientName of clientNames) {
        const matchingAccounts = accounts?.filter(acc => {
          const accNameLower = acc.name.toLowerCase();
          const clientNameLower = clientName.toLowerCase();

          return accNameLower.includes(clientNameLower) || clientNameLower.includes(accNameLower);
        });

        if (matchingAccounts && matchingAccounts.length > 0) {
          console.log(`  ✓ "${clientName}" matches ${matchingAccounts.length} account(s):`);
          matchingAccounts.forEach(acc => {
            console.log(`      → ${acc.name}`);
            potentialLinks.push({
              jira_key: ticket.jira_key,
              client_name: clientName,
              account_id: acc.id,
              account_name: acc.name
            });
          });
        } else {
          console.log(`  ✗ No account match for "${clientName}"`);
        }
      }
    }
  }

  console.log(`\n\n=== Summary ===`);
  console.log(`Total potential links: ${potentialLinks.length}`);

  // Show West Coast specific matches
  const westCoastLinks = potentialLinks.filter(link =>
    link.client_name.toLowerCase().includes('west coast') ||
    link.account_name.toLowerCase().includes('west coast')
  );

  if (westCoastLinks.length > 0) {
    console.log(`\n✅ West Coast Self-Storage tickets (${westCoastLinks.length}):`);
    westCoastLinks.forEach(link => {
      console.log(`  ${link.jira_key} → ${link.account_name}`);
    });
  }

  // Check current account_jira_links for West Coast
  const westCoastAccount = accounts?.find(a => a.name.includes('West Coast Self-Storage'));
  if (westCoastAccount) {
    const { data: existingLinks } = await supabase
      .from('account_jira_links')
      .select('id, jira_issue:jira_issues!inner(jira_key), match_type, match_confidence')
      .eq('account_id', westCoastAccount.id);

    console.log(`\n📊 Current links for ${westCoastAccount.name}: ${existingLinks?.length || 0}`);
    const byMatchType = existingLinks?.reduce((acc: any, link: any) => {
      acc[link.match_type] = (acc[link.match_type] || 0) + 1;
      return acc;
    }, {});
    console.log(`  By match type:`, byMatchType);
  }
}

testClientFieldLinking().catch(console.error);
