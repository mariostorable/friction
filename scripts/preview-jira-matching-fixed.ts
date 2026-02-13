import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function previewMatching() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Get user ID
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const userId = users?.[0]?.id;

  if (!userId) {
    console.error('No user found');
    return;
  }

  console.log('\n=== Jira Matching Preview ===\n');

  // Get all Jira issues for this user
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, description, metadata')
    .eq('user_id', userId);

  // Get all accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, salesforce_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  // Get all raw inputs (cases) with case_number
  const { data: cases } = await supabase
    .from('raw_inputs')
    .select('case_number, account_id')
    .eq('user_id', userId)
    .not('case_number', 'is', null);

  // Build case number -> account ID map
  const caseToAccount = new Map<string, string>();
  cases?.forEach(c => {
    if (c.case_number) {
      // Handle both formats: "03717747" and "3717747"
      caseToAccount.set(c.case_number, c.account_id);
      caseToAccount.set(c.case_number.replace(/^0+/, ''), c.account_id); // Without leading zeros
    }
  });

  console.log(`Total Jira issues: ${issues?.length || 0}`);
  console.log(`Active accounts: ${accounts?.length || 0}`);
  console.log(`Cases with case_number: ${cases?.length || 0}\n`);

  let withCaseIds = 0;
  let matchedAccounts = new Set<string>();
  const examples: string[] = [];

  issues?.forEach(issue => {
    const customFields = issue.metadata?.custom_fields || {};
    let foundCaseId = false;
    let accountsForThisTicket = new Set<string>();

    // Check all custom fields for case numbers
    for (const [key, value] of Object.entries(customFields)) {
      if (!value) continue;
      const fieldValue = value.toString();

      // Find 8-digit case numbers
      const caseMatches = fieldValue.match(/\b\d{8}\b/g);
      if (caseMatches) {
        foundCaseId = true;
        caseMatches.forEach(caseNum => {
          let accountId = caseToAccount.get(caseNum);
          // Try without leading zeros
          if (!accountId) {
            accountId = caseToAccount.get(caseNum.replace(/^0+/, ''));
          }
          if (accountId) {
            accountsForThisTicket.add(accountId);
            matchedAccounts.add(accountId);
          }
        });
      }
    }

    // Also check summary and description
    const searchText = `${issue.summary} ${issue.description || ''}`;
    const caseMatches = searchText.match(/\b\d{8}\b/g);
    if (caseMatches) {
      foundCaseId = true;
      caseMatches.forEach(caseNum => {
        let accountId = caseToAccount.get(caseNum);
        if (!accountId) {
          accountId = caseToAccount.get(caseNum.replace(/^0+/, ''));
        }
        if (accountId) {
          accountsForThisTicket.add(accountId);
          matchedAccounts.add(accountId);
        }
      });
    }

    if (foundCaseId) {
      withCaseIds++;
      if (examples.length < 10 && accountsForThisTicket.size > 0) {
        const accountNames = Array.from(accountsForThisTicket)
          .map(id => accounts?.find(a => a.id === id)?.name || 'Unknown')
          .join(', ');
        examples.push(`  ${issue.jira_key} → ${accountsForThisTicket.size} account(s): ${accountNames}`);
      }
    }
  });

  console.log('Expected Results After Re-sync:\n');
  console.log(`✓ Issues with Case IDs: ${withCaseIds} (${((withCaseIds / (issues?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`✓ Unique accounts that will be linked: ${matchedAccounts.size}`);
  console.log(`✓ Estimated account-jira links: ~${Math.round(withCaseIds * 1.2)}\n`);

  if (examples.length > 0) {
    console.log('Example matches:\n');
    examples.forEach(ex => console.log(ex));
  } else {
    console.log('⚠️  No matches found! This suggests:');
    console.log('  1. Case numbers in Jira don\'t match case_number field in raw_inputs');
    console.log('  2. Cases might use different format (with/without leading zeros)');
    console.log('  3. Cases might be in a different field\n');

    // Show a sample Jira issue and case
    if (issues && issues.length > 0) {
      const sampleIssue = issues[0];
      console.log('\nSample Jira issue:');
      console.log(`  Key: ${sampleIssue.jira_key}`);
      console.log(`  Summary: ${sampleIssue.summary.slice(0, 80)}`);

      const customFields = sampleIssue.metadata?.custom_fields || {};
      console.log('  Custom fields with numbers:');
      Object.entries(customFields).forEach(([key, value]) => {
        if (value && value.toString().match(/\d{6,}/)) {
          console.log(`    ${key}: ${value.toString().slice(0, 100)}`);
        }
      });
    }

    if (cases && cases.length > 0) {
      console.log('\nSample case numbers from raw_inputs:');
      cases.slice(0, 5).forEach(c => {
        const accountName = accounts?.find(a => a.id === c.account_id)?.name || 'Unknown';
        console.log(`  ${c.case_number} → ${accountName}`);
      });
    }
  }

  // Show accounts without Jira tickets
  const accountsWithoutTickets = accounts?.filter(a => !matchedAccounts.has(a.id)) || [];
  console.log(`\n${matchedAccounts.size > 0 ? '✅' : '⚠️'}  ${matchedAccounts.size} accounts will have Jira tickets`);
  console.log(`⚠️  ${accountsWithoutTickets.length} accounts won't have Jira tickets\n`);
}

previewMatching().catch(console.error);
