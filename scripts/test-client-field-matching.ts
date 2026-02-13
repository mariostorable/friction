import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testClientMatching() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Testing Client Field Matching ===\n');

  // Get all accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active');

  console.log(`Total active accounts: ${accounts?.length || 0}\n`);

  // Get all Jira tickets
  const { data: tickets } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .eq('user_id', userId);

  let withClientField = 0;
  let totalMatches = 0;
  const matchedAccounts = new Set<string>();
  const examples: any[] = [];

  tickets?.forEach((ticket: any) => {
    const customFields = ticket.metadata?.custom_fields || {};
    const clientFieldValue = customFields['customfield_12184'];

    if (clientFieldValue && typeof clientFieldValue === 'string') {
      withClientField++;

      // Parse semicolon or comma-separated client names
      const clientNames = clientFieldValue
        .split(/[;,]/)
        .map(name => name.trim())
        .filter(name => name.length > 0);

      const matchedAccountsForTicket = new Set<string>();

      clientNames.forEach(clientName => {
        const clientNameLower = clientName.toLowerCase();

        // Try exact matches first
        let matchingAccounts = accounts?.filter(acc => {
          const accNameLower = acc.name.toLowerCase();
          return accNameLower === clientNameLower;
        });

        // If no exact match, try partial matching with significant words
        if (!matchingAccounts || matchingAccounts.length === 0) {
          const clientWords = clientNameLower
            .split(/[\s-]+/)
            .filter((word: string) => word.length > 3);

          if (clientWords.length > 0) {
            matchingAccounts = accounts?.filter(acc => {
              const accNameLower = acc.name.toLowerCase();
              return clientWords.every((word: string) => accNameLower.includes(word));
            });
          }
        }

        matchingAccounts?.forEach(acc => {
          matchedAccountsForTicket.add(acc.id);
          matchedAccounts.add(acc.id);
        });
      });

      if (matchedAccountsForTicket.size > 0) {
        totalMatches++;

        if (examples.length < 10) {
          const accountNames = Array.from(matchedAccountsForTicket)
            .map(id => accounts?.find(a => a.id === id)?.name || 'Unknown')
            .join(', ');

          examples.push({
            jira_key: ticket.jira_key,
            client_field: clientFieldValue,
            matched: accountNames,
            count: matchedAccountsForTicket.size
          });
        }
      }
    }
  });

  console.log(`Tickets with customfield_12184: ${withClientField} out of ${tickets?.length || 0}`);
  console.log(`Tickets with matches: ${totalMatches}`);
  console.log(`Unique accounts matched: ${matchedAccounts.size}\n`);

  if (examples.length > 0) {
    console.log('Example matches:\n');
    examples.forEach(ex => {
      console.log(`${ex.jira_key}:`);
      console.log(`  Client field: ${ex.client_field}`);
      console.log(`  Matched: ${ex.matched} (${ex.count} account(s))`);
      console.log('');
    });
  }

  console.log('\n📊 Expected Results:');
  console.log(`  Current account-jira links: 528`);
  console.log(`  Links from client field matching: ${totalMatches}`);
  console.log(`  Accounts with Jira tickets: ${matchedAccounts.size}`);
}

testClientMatching().catch(console.error);
