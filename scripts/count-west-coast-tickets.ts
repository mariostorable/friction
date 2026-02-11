import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function countWestCoastTickets() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  // Get all tickets with customfield_12184
  const { data: allTickets } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .eq('user_id', userId)
    .not('metadata->custom_fields->customfield_12184', 'is', null);

  console.log(`\n=== West Coast Tickets Analysis ===\n`);
  console.log(`Total tickets with Client field: ${allTickets?.length || 0}`);

  // Filter for West Coast
  const westCoastTickets = allTickets?.filter(t => {
    const clientField = t.metadata?.custom_fields?.customfield_12184;
    return clientField && typeof clientField === 'string' &&
           clientField.toLowerCase().includes('west coast');
  });

  console.log(`Tickets with "West Coast" in Client field: ${westCoastTickets?.length || 0}`);

  if (westCoastTickets && westCoastTickets.length > 0) {
    console.log('\nAll West Coast tickets:');
    westCoastTickets.forEach(t => {
      console.log(`  - ${t.jira_key}: ${t.summary.substring(0, 70)}...`);
    });
  }

  // Also check for "White Label" which was in the PDF
  const whiteLabelTickets = allTickets?.filter(t => {
    const clientField = t.metadata?.custom_fields?.customfield_12184;
    return clientField && typeof clientField === 'string' &&
           clientField.toLowerCase().includes('white label');
  });

  console.log(`\n\nTickets with "White Label" in Client field: ${whiteLabelTickets?.length || 0}`);
  if (whiteLabelTickets && whiteLabelTickets.length > 0) {
    console.log('\nSample White Label tickets:');
    whiteLabelTickets.slice(0, 5).forEach(t => {
      console.log(`  - ${t.jira_key}: ${t.summary.substring(0, 70)}...`);
    });
  }
}

countWestCoastTickets().catch(console.error);
