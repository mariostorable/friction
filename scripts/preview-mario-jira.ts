import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function previewMatching() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9'; // mario@storable.com

  console.log('\n=== Jira Matching Preview for mario@storable.com ===\n');

  // Get all Jira issues
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, description, metadata')
    .eq('user_id', userId);

  // Get Top 25 accounts (status = active)
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active');

  // Get cases with case_number
  const { data: cases } = await supabase
    .from('raw_inputs')
    .select('case_number, account_id')
    .eq('user_id', userId)
    .not('case_number', 'is', null);

  // Build case number -> account ID map
  const caseToAccount = new Map<string, string>();
  cases?.forEach(c => {
    if (c.case_number) {
      caseToAccount.set(c.case_number, c.account_id);
      caseToAccount.set(c.case_number.replace(/^0+/, ''), c.account_id);
    }
  });

  console.log(`Jira issues: ${issues?.length || 0}`);
  console.log(`Top 25 accounts: ${accounts?.length || 0}`);
  console.log(`Cases with case_number: ${cases?.length || 0}\n`);

  let withCaseIds = 0;
  let totalLinks = 0;
  const matchedAccounts = new Set<string>();
  const examples: string[] = [];

  issues?.forEach(issue => {
    const customFields = issue.metadata?.custom_fields || {};
    const accountsForThisTicket = new Set<string>();

    // Check custom fields
    for (const [key, value] of Object.entries(customFields)) {
      if (!value) continue;
      const fieldValue = value.toString();

      const caseMatches = fieldValue.match(/\b\d{8}\b/g);
      if (caseMatches) {
        caseMatches.forEach(caseNum => {
          let accountId = caseToAccount.get(caseNum) || caseToAccount.get(caseNum.replace(/^0+/, ''));
          if (accountId) {
            accountsForThisTicket.add(accountId);
            matchedAccounts.add(accountId);
          }
        });
      }
    }

    // Check summary/description
    const searchText = `${issue.summary} ${issue.description || ''}`;
    const caseMatches = searchText.match(/\b\d{8}\b/g);
    if (caseMatches) {
      caseMatches.forEach(caseNum => {
        let accountId = caseToAccount.get(caseNum) || caseToAccount.get(caseNum.replace(/^0+/, ''));
        if (accountId) {
          accountsForThisTicket.add(accountId);
          matchedAccounts.add(accountId);
        }
      });
    }

    if (accountsForThisTicket.size > 0) {
      withCaseIds++;
      totalLinks += accountsForThisTicket.size;

      if (examples.length < 10) {
        const accountNames = Array.from(accountsForThisTicket)
          .map(id => accounts?.find(a => a.id === id)?.name || 'Unknown')
          .join(', ');
        examples.push(`  ${issue.jira_key} → ${accountsForThisTicket.size} account(s): ${accountNames}`);
      }
    }
  });

  console.log('🎯 Expected Results After Re-sync:\n');
  console.log(`✅ Issues with Case ID matches: ${withCaseIds} (${((withCaseIds / (issues?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`✅ Unique accounts with Jira tickets: ${matchedAccounts.size}`);
  console.log(`✅ Total account-jira links: ${totalLinks}\n`);

  if (examples.length > 0) {
    console.log('Example matches:\n');
    examples.forEach(ex => console.log(ex));
  } else {
    console.log('⚠️  No matches found!\n');

    // Show sample data to debug
    if (issues && issues.length > 0) {
      console.log('Sample Jira issue:');
      const sample = issues[0];
      console.log(`  ${sample.jira_key}: ${sample.summary.slice(0, 80)}`);
    }

    if (cases && cases.length > 0) {
      console.log('\nSample cases:');
      cases.slice(0, 3).forEach(c => console.log(`  ${c.case_number}`));
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Current links: 528 (old broad matching)`);
  console.log(`  New links: ${totalLinks} (Salesforce Case ID matching)`);
  console.log(`  Change: ${totalLinks - 528} (${totalLinks > 528 ? '+' : ''}${((totalLinks - 528) / 528 * 100).toFixed(1)}%)\n`);
}

previewMatching().catch(console.error);
