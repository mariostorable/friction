import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkOrphanedLinks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Checking for Orphaned Links ===\n');

  // Get sample account_jira_links
  const { data: links } = await supabase
    .from('account_jira_links')
    .select('id, jira_issue_id, account_id, match_type, created_at')
    .eq('user_id', userId)
    .limit(10);

  console.log(`Found ${links?.length || 0} sample links\n`);

  if (!links || links.length === 0) {
    console.log('No links to check');
    return;
  }

  // Check if corresponding jira_issues exist
  const issueIds = links.map(l => l.jira_issue_id);
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('id, jira_key, user_id')
    .in('id', issueIds);

  console.log('Link validation:');
  links.forEach(link => {
    const issue = issues?.find(i => i.id === link.jira_issue_id);
    if (issue) {
      console.log(`  ✓ Link ${link.id.substring(0, 8)}: jira_issue exists (${issue.jira_key})`);
      if (issue.user_id !== userId) {
        console.log(`    ⚠️  User ID mismatch! Issue user_id: ${issue.user_id}`);
      }
    } else {
      console.log(`  ✗ Link ${link.id.substring(0, 8)}: jira_issue NOT FOUND (${link.jira_issue_id.substring(0, 8)})`);
    }
  });

  // Count total orphaned links
  const allIssueIds = links.map(l => l.jira_issue_id);
  const foundIssueIds = new Set(issues?.map(i => i.id) || []);
  const orphanedCount = allIssueIds.filter(id => !foundIssueIds.has(id)).length;

  console.log(`\nOrphaned links in sample: ${orphanedCount}/${links.length}`);

  // Test the actual join syntax that fails
  console.log('\n--- Testing Join Syntax ---\n');

  const { data: joinTest, error: joinError } = await supabase
    .from('account_jira_links')
    .select('account_id, jira_issues(*)')
    .eq('user_id', userId)
    .limit(3);

  console.log('Join without !inner:');
  console.log(`  Result: ${joinTest?.length || 0} rows`);
  if (joinError) {
    console.log(`  Error: ${joinError.message}`);
    console.log(`  Code: ${joinError.code}`);
    console.log(`  Details: ${joinError.details}`);
  }
  if (joinTest && joinTest.length > 0) {
    joinTest.forEach((row: any, i: number) => {
      console.log(`  Row ${i + 1}: jira_issues = ${row.jira_issues ? 'EXISTS' : 'NULL'}`);
    });
  }
}

checkOrphanedLinks().catch(console.error);
