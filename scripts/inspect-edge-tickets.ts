import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function inspect() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Inspecting EDGE & SL Jira Tickets ===\n');

  // Get sample EDGE tickets
  const { data: edgeTickets } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, description, metadata')
    .eq('user_id', userId)
    .ilike('jira_key', 'EDGE%')
    .limit(5);

  console.log('EDGE Tickets:\n');
  edgeTickets?.forEach((ticket: any) => {
    console.log(`${ticket.jira_key}: ${ticket.summary.slice(0, 60)}`);
    console.log(`Description: ${(ticket.description || 'N/A').slice(0, 100)}`);

    const customFields = ticket.metadata?.custom_fields || {};
    console.log(`Custom fields (${Object.keys(customFields).length} total):`);

    // Show all custom fields and their values
    Object.entries(customFields).forEach(([key, value]) => {
      if (value) {
        const valStr = String(value).slice(0, 80);
        console.log(`  ${key}: ${valStr}`);
      }
    });

    // Look for case ID patterns (8 digits)
    const allText = `${ticket.summary} ${ticket.description || ''} ${JSON.stringify(customFields)}`;
    const caseMatches = allText.match(/\b\d{8}\b/g);
    if (caseMatches) {
      console.log(`  Found potential case IDs: ${caseMatches.join(', ')}`);
    }
    console.log('');
  });

  // Get sample SL tickets
  const { data: slTickets } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, description, metadata')
    .eq('user_id', userId)
    .ilike('jira_key', 'SL%')
    .limit(3);

  console.log('\n\nSL Tickets:\n');
  slTickets?.forEach((ticket: any) => {
    console.log(`${ticket.jira_key}: ${ticket.summary.slice(0, 60)}`);
    console.log(`Description: ${(ticket.description || 'N/A').slice(0, 100)}`);

    const customFields = ticket.metadata?.custom_fields || {};
    console.log(`Custom fields (${Object.keys(customFields).length} total):`);

    Object.entries(customFields).forEach(([key, value]) => {
      if (value) {
        const valStr = String(value).slice(0, 80);
        console.log(`  ${key}: ${valStr}`);
      }
    });

    const allText = `${ticket.summary} ${ticket.description || ''} ${JSON.stringify(customFields)}`;
    const caseMatches = allText.match(/\b\d{8}\b/g);
    if (caseMatches) {
      console.log(`  Found potential case IDs: ${caseMatches.join(', ')}`);
    }
    console.log('');
  });

  // Show sample Salesforce case IDs for comparison
  console.log('\n\nSample Salesforce Case IDs (for comparison):\n');
  const { data: cases } = await supabase
    .from('raw_inputs')
    .select('source_id, account_id')
    .eq('user_id', userId)
    .not('source_id', 'is', null)
    .limit(10);

  cases?.forEach((c: any) => {
    console.log(`  ${c.source_id} (account: ${c.account_id.slice(0, 8)}...)`);
  });
}

inspect().catch(console.error);
