import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkJiraFields() {
  console.log('\n=== Checking Jira Issues for Account Matching Opportunities ===\n');

  const { data } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, description, metadata')
    .eq('user_id', 'ab953672-7bad-4601-9289-5d766e73fec9')
    .limit(10);

  console.log(`Examining ${data?.length || 0} Jira tickets:\n`);

  data?.forEach((issue) => {
    console.log(`\n=== ${issue.jira_key} ===`);
    console.log('Summary:', issue.summary?.slice(0, 100));
    console.log('Description:', issue.description?.slice(0, 200));

    const customFields = issue.metadata?.custom_fields || {};
    const fieldKeys = Object.keys(customFields).filter(k => k.startsWith('customfield'));

    // Check for account-related fields
    const accountFields: string[] = [];
    fieldKeys.forEach(key => {
      const value = customFields[key];
      if (value && typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        if (lowerValue.includes('storage') ||
            lowerValue.includes('marine') ||
            lowerValue.includes('corp') ||
            lowerValue.includes('spartan') ||
            lowerValue.includes('elite') ||
            lowerValue.includes('group')) {
          accountFields.push(`  ${key}: ${value.slice(0, 80)}`);
        }
      }
    });

    if (accountFields.length > 0) {
      console.log('Account-related custom fields:');
      accountFields.forEach(f => console.log(f));
    }
  });

  console.log('\n\n=== Summary ===');
  console.log('Check if account names appear in:');
  console.log('  1. Summary field');
  console.log('  2. Description field');
  console.log('  3. Custom fields (shown above)\n');
}

checkJiraFields();
