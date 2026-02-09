import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function debugMreqMatching() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== DEBUG: Why MREQ-6988 and MREQ-7408 aren\'t matching ===\n');

  // Step 1: Check if these case IDs are in the database
  const { data: caseCards } = await supabaseAdmin
    .from('friction_cards')
    .select(`
      id,
      account_id,
      raw_input:raw_inputs!inner(source_id, source_type)
    `)
    .eq('user_id', userId)
    .eq('raw_inputs.source_type', 'salesforce')
    .in('raw_inputs.source_id', ['03690227', '03732752']);

  console.log('Case IDs in database:', caseCards?.map((c: any) => c.raw_input?.source_id));

  // Step 2: Check what's in customfield_17254 for these MREQ tickets
  const { data: mreqTickets } = await supabaseAdmin
    .from('jira_issues')
    .select('jira_key, metadata')
    .eq('user_id', userId)
    .in('jira_key', ['MREQ-6988', 'MREQ-7408']);

  console.log('\nMREQ tickets:');
  mreqTickets?.forEach((ticket: any) => {
    const customFields = ticket.metadata?.custom_fields || {};
    const customfield_17254 = customFields['customfield_17254'];
    console.log(`  ${ticket.jira_key}:`);
    console.log(`    customfield_17254: "${customfield_17254}"`);
    console.log(`    typeof: ${typeof customfield_17254}`);

    if (customfield_17254) {
      // Try the same regex the script uses
      const matches = customfield_17254.toString().match(/\b\d{8}\b/g);
      console.log(`    Regex matches: ${matches ? matches.join(', ') : 'none'}`);

      // Check for the pipe character
      if (customfield_17254.includes('|')) {
        console.log(`    ⚠️  Contains pipe character: "${customfield_17254}"`);
      }
    }
  });
}

debugMreqMatching();
