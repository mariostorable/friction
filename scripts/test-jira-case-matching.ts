import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testMatching() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  // Get case IDs
  const { data: cases } = await supabase
    .from('raw_inputs')
    .select('source_id, account_id')
    .eq('user_id', userId)
    .eq('source_type', 'salesforce')
    .not('source_id', 'is', null)
    .limit(1000);

  const caseToAccount = new Map<string, string>();
  cases?.forEach(c => {
    caseToAccount.set(c.source_id, c.account_id);
  });

  console.log(`\n=== Testing Jira Case Matching ===\n`);
  console.log(`Sample case IDs: ${Array.from(caseToAccount.keys()).slice(0, 5).join(', ')}`);

  // Get Jira issues
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, description, metadata')
    .eq('user_id', userId)
    .limit(50);

  console.log(`\nJira issues: ${issues?.length || 0}\n`);

  let matchCount = 0;
  const examples: string[] = [];

  issues?.forEach(issue => {
    const customFields = issue.metadata?.custom_fields || {};
    const searchText = `${issue.summary} ${issue.description || ''} ${JSON.stringify(customFields)}`;

    // Look for any of our case IDs in this ticket
    const foundCases: string[] = [];
    Array.from(caseToAccount.keys()).slice(0, 100).forEach(caseId => {
      if (searchText.includes(caseId)) {
        foundCases.push(caseId);
      }
    });

    if (foundCases.length > 0) {
      matchCount++;
      if (examples.length < 10) {
        const accountNames = foundCases.map(cid => {
          const accId = caseToAccount.get(cid);
          return `${cid} (account)`;
        }).join(', ');
        examples.push(`  ${issue.jira_key}: Found cases ${accountNames}`);
      }
    }
  });

  console.log(`Matches found: ${matchCount} out of ${issues?.length || 0} Jira tickets\n`);

  if (examples.length > 0) {
    console.log('Examples:\n');
    examples.forEach(ex => console.log(ex));
  } else {
    console.log('⚠️  No matches found!\n');
    console.log('Sample Jira issue content:');
    if (issues && issues.length > 0) {
      const sample = issues[0];
      console.log(`  Key: ${sample.jira_key}`);
      console.log(`  Summary: ${sample.summary.slice(0, 100)}`);
      const customFields = sample.metadata?.custom_fields || {};
      const fieldsWithNumbers = Object.entries(customFields)
        .filter(([k, v]) => v && v.toString().match(/\d{6,}/))
        .slice(0, 5);
      if (fieldsWithNumbers.length > 0) {
        console.log('\n  Fields with 6+ digit numbers:');
        fieldsWithNumbers.forEach(([k, v]) => {
          console.log(`    ${k}: ${v.toString().slice(0, 80)}`);
        });
      }
    }
  }
}

testMatching().catch(console.error);
