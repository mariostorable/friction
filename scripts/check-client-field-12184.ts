import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkClientField() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Checking customfield_12184 (potential Client field) ===\n');

  // Get all tickets that have customfield_12184
  const { data: tickets } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .eq('user_id', userId)
    .not('metadata->custom_fields->customfield_12184', 'is', null);

  console.log(`Found ${tickets?.length || 0} tickets with customfield_12184\n`);

  const clientValues = new Set<string>();

  tickets?.forEach(ticket => {
    const clientValue = ticket.metadata?.custom_fields?.customfield_12184;
    if (clientValue) {
      clientValues.add(clientValue);
      console.log(`${ticket.jira_key}: ${ticket.summary.substring(0, 60)}...`);
      console.log(`  Client(s): ${clientValue}\n`);
    }
  });

  console.log('\n=== Unique Client Values ===');
  console.log(`Found ${clientValues.size} unique client values:`);
  Array.from(clientValues).sort().forEach(value => {
    console.log(`  - ${value}`);
  });

  // Also check if we have any accounts that match these client names
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active');

  console.log('\n=== Potential Matches with Accounts ===');
  for (const clientValue of Array.from(clientValues)) {
    const matchingAccounts = accounts?.filter(acc =>
      acc.name.toLowerCase().includes(clientValue.toLowerCase()) ||
      clientValue.toLowerCase().includes(acc.name.toLowerCase())
    );

    if (matchingAccounts && matchingAccounts.length > 0) {
      console.log(`\nClient value "${clientValue}" matches:`);
      matchingAccounts.forEach(acc => {
        console.log(`  ✓ ${acc.name}`);
      });
    }
  }
}

checkClientField().catch(console.error);
