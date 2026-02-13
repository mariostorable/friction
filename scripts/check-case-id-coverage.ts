import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkCaseIdCoverage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Get all Jira issues
  const { data: allIssues, count: totalCount } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, description, metadata', { count: 'exact' });

  console.log('\n=== Salesforce Case ID Coverage in Jira ===\n');
  console.log(`Total Jira tickets: ${totalCount}`);

  // Check how many have Case IDs
  let withCaseIds = 0;
  let withoutCaseIds = 0;
  const caseIdExamples: string[] = [];

  allIssues?.forEach((issue: any) => {
    const customFields = issue.metadata?.custom_fields || {};
    let found = false;

    // Check all custom fields for case numbers (8 digits)
    for (const [key, value] of Object.entries(customFields)) {
      if (!value) continue;
      const fieldValue = value.toString();

      if (fieldValue.match(/\b\d{8}\b/) || fieldValue.match(/\b500[a-zA-Z0-9]{12,15}\b/)) {
        found = true;
        if (caseIdExamples.length < 5) {
          caseIdExamples.push(`${issue.jira_key}: ${fieldValue.slice(0, 50)}`);
        }
        break;
      }
    }

    // Also check summary and description
    const searchText = `${issue.summary} ${issue.description || ''}`;
    if (!found && (searchText.match(/\b\d{8}\b/) || searchText.match(/\b500[a-zA-Z0-9]{12,15}\b/))) {
      found = true;
      if (caseIdExamples.length < 5) {
        const match = searchText.match(/\b\d{8}\b/) || searchText.match(/\b500[a-zA-Z0-9]{12,15}\b/);
        caseIdExamples.push(`${issue.jira_key}: ${match?.[0]}`);
      }
    }

    if (found) {
      withCaseIds++;
    } else {
      withoutCaseIds++;
    }
  });

  console.log(`\nWith Salesforce Case IDs: ${withCaseIds} (${((withCaseIds / totalCount!) * 100).toFixed(1)}%)`);
  console.log(`Without Case IDs: ${withoutCaseIds} (${((withoutCaseIds / totalCount!) * 100).toFixed(1)}%)`);

  console.log('\nExamples of tickets WITH Case IDs:');
  caseIdExamples.forEach(ex => console.log(`  - ${ex}`));

  // Check account_jira_links
  const { count: linkCount } = await supabase
    .from('account_jira_links')
    .select('*', { count: 'exact', head: true });

  console.log(`\nCurrent account_jira_links: ${linkCount} links`);
  console.log(`Expected if all tickets with Case IDs were linked: ~${withCaseIds} links`);
}

checkCaseIdCoverage().catch(console.error);
