import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function findMatches() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Finding Matching Cases Between Jira and Salesforce ===\n');

  // Get all 8-digit Salesforce case IDs
  const { data: sfCases } = await supabase
    .from('raw_inputs')
    .select('source_id, account_id')
    .eq('user_id', userId)
    .not('source_id', 'is', null);

  const sfCaseIds = new Set<string>();
  const caseToAccount = new Map<string, string>();

  sfCases?.forEach((c: any) => {
    const id = c.source_id;
    sfCaseIds.add(id);
    caseToAccount.set(id, c.account_id);

    // Also try without leading zeros
    if (/^\d+$/.test(id)) {
      const withoutZeros = id.replace(/^0+/, '');
      if (withoutZeros !== id) {
        caseToAccount.set(withoutZeros, c.account_id);
      }
    }
  });

  console.log(`Total Salesforce case IDs: ${sfCaseIds.size}\n`);

  // Get all Jira tickets
  const { data: tickets } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, description, metadata')
    .eq('user_id', userId);

  let matchCount = 0;
  const matches: any[] = [];

  tickets?.forEach((ticket: any) => {
    const customFields = ticket.metadata?.custom_fields || {};
    const matchedCases = new Set<string>();

    // Check all custom fields for case IDs
    for (const [fieldKey, fieldValue] of Object.entries(customFields)) {
      if (!fieldValue) continue;

      const valueStr = String(fieldValue);

      // Look for 8-digit patterns
      const patterns = valueStr.match(/\b\d{8}\b/g);
      if (patterns) {
        patterns.forEach(pattern => {
          if (sfCaseIds.has(pattern)) {
            matchedCases.add(pattern);
          }
        });
      }

      // Look for 18-char Salesforce IDs
      const longPatterns = valueStr.match(/\b[0-9A-Za-z]{18}\b/g);
      if (longPatterns) {
        longPatterns.forEach(pattern => {
          if (sfCaseIds.has(pattern)) {
            matchedCases.add(pattern);
          }
        });
      }
    }

    // Also check summary and description
    const textToSearch = `${ticket.summary} ${ticket.description || ''}`;
    const patterns = textToSearch.match(/\b\d{8}\b/g);
    if (patterns) {
      patterns.forEach(pattern => {
        if (sfCaseIds.has(pattern)) {
          matchedCases.add(pattern);
        }
      });
    }

    if (matchedCases.size > 0) {
      matchCount++;
      matches.push({
        jira_key: ticket.jira_key,
        cases: Array.from(matchedCases),
        accounts: Array.from(matchedCases).map(c => caseToAccount.get(c))
      });
    }
  });

  console.log(`✅ Jira tickets with matching Salesforce cases: ${matchCount} out of ${tickets?.length || 0}\n`);

  if (matches.length > 0) {
    console.log('Sample matches:\n');
    matches.slice(0, 10).forEach(m => {
      console.log(`${m.jira_key}:`);
      console.log(`  Cases: ${m.cases.join(', ')}`);
      console.log(`  Accounts: ${m.accounts.map((a: string) => a?.slice(0, 12)).join(', ')}`);
    });

    // Count unique accounts
    const uniqueAccounts = new Set<string>();
    matches.forEach(m => {
      m.accounts.forEach((a: string) => {
        if (a) uniqueAccounts.add(a);
      });
    });

    console.log(`\n✅ Unique accounts with matches: ${uniqueAccounts.size}`);
  } else {
    console.log('❌ No matches found!\n');
    console.log('This suggests either:');
    console.log('1. The Jira tickets are from a different time period than Salesforce cases');
    console.log('2. The case IDs in Jira use a different format');
    console.log('3. The data hasn\'t been synced properly');
  }
}

findMatches().catch(console.error);
