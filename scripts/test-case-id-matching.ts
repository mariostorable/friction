import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testMatching() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  // Get the SLT-9281 ticket which has case IDs in customfield_17254
  const { data: tickets } = await supabase
    .from('jira_issues')
    .select('jira_key, metadata')
    .eq('user_id', userId)
    .eq('jira_key', 'SLT-9281');

  console.log('\n=== Testing Case ID Matching ===\n');

  if (tickets && tickets.length > 0) {
    const ticket = tickets[0];
    const customField17254 = ticket.metadata?.custom_fields?.customfield_17254;

    console.log(`Ticket: ${ticket.jira_key}`);
    console.log(`customfield_17254: ${customField17254}\n`);

    if (customField17254) {
      // Extract case IDs from pipe-separated format
      const caseIds = customField17254
        .split('|')
        .map((id: string) => id.trim())
        .filter((id: string) => /^\d{8}$/.test(id));

      console.log(`Extracted case IDs (${caseIds.length}): ${caseIds.slice(0, 10).join(', ')}...\n`);

      // Check if these case IDs exist in Salesforce
      for (const caseId of caseIds.slice(0, 5)) {
        const { data: cases, count } = await supabase
          .from('raw_inputs')
          .select('id, source_id, account_id', { count: 'exact' })
          .eq('user_id', userId)
          .or(`source_id.eq.${caseId},source_id.eq.0${caseId}`);

        if (cases && cases.length > 0) {
          console.log(`✅ Case ID ${caseId} found in Salesforce:`);
          cases.forEach(c => {
            console.log(`   source_id: ${c.source_id}, account: ${c.account_id.slice(0, 12)}...`);
          });
        } else {
          console.log(`❌ Case ID ${caseId} NOT found in Salesforce`);
        }
      }
    }
  }

  // Check what format Salesforce case IDs are using
  console.log('\n\nSalesforce Case ID Formats:\n');
  const { data: allCases } = await supabase
    .from('raw_inputs')
    .select('source_id')
    .eq('user_id', userId)
    .not('source_id', 'is', null)
    .limit(50);

  const formats = {
    eightDigit: 0,
    longFormat: 0,
    other: 0
  };

  allCases?.forEach((c: any) => {
    if (/^\d{8}$/.test(c.source_id)) {
      formats.eightDigit++;
    } else if (/^[0-9A-Za-z]{18}$/.test(c.source_id)) {
      formats.longFormat++;
    } else {
      formats.other++;
    }
  });

  console.log(`8-digit format: ${formats.eightDigit}`);
  console.log(`18-char format: ${formats.longFormat}`);
  console.log(`Other format: ${formats.other}`);

  console.log('\nSample 8-digit case IDs from Salesforce:');
  allCases
    ?.filter((c: any) => /^\d{8}$/.test(c.source_id))
    .slice(0, 10)
    .forEach((c: any) => console.log(`  ${c.source_id}`));
}

testMatching().catch(console.error);
