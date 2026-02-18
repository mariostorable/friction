import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkForeignKeys() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Checking Foreign Key Names ===\n');

  // Get a sample account_jira_link to see its structure
  const { data: sampleLink } = await supabase
    .from('account_jira_links')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .single();

  console.log('Sample account_jira_link structure:');
  console.log(sampleLink);
  console.log('\nFields:', Object.keys(sampleLink || {}));

  // Try different join syntaxes
  console.log('\n--- Testing Join Syntaxes ---\n');

  // Test 1: Using jira_issue_id as the relationship
  const { data: test1, error: error1 } = await supabase
    .from('account_jira_links')
    .select('account_id, jira_issue_id, jira_issues(*)')
    .eq('user_id', userId)
    .limit(5);

  console.log('Test 1: jira_issues(*)');
  console.log(`  Result: ${test1?.length || 0} rows`);
  if (error1) console.log(`  Error: ${error1.message}`);
  if (test1 && test1.length > 0) {
    console.log('  Sample:', JSON.stringify(test1[0], null, 2));
  }

  // Test 2: Using inner join
  const { data: test2, error: error2 } = await supabase
    .from('account_jira_links')
    .select('account_id, jira_issue_id, jira_issues!inner(*)')
    .eq('user_id', userId)
    .limit(5);

  console.log('\nTest 2: jira_issues!inner(*)');
  console.log(`  Result: ${test2?.length || 0} rows`);
  if (error2) console.log(`  Error: ${error2.message}`);

  // Test 3: Manual join
  const { data: links } = await supabase
    .from('account_jira_links')
    .select('account_id, jira_issue_id')
    .eq('user_id', userId)
    .limit(5);

  if (links && links.length > 0) {
    const issueIds = links.map(l => l.jira_issue_id);
    const { data: issues } = await supabase
      .from('jira_issues')
      .select('*')
      .in('id', issueIds)
      .eq('user_id', userId);

    console.log('\nTest 3: Manual join');
    console.log(`  Links: ${links.length}`);
    console.log(`  Issues found: ${issues?.length || 0}`);
  }
}

checkForeignKeys().catch(console.error);
