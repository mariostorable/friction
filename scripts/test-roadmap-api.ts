import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testRoadmapAPI() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Testing Roadmap API Query ===\n');

  // Step 1: Get accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active');

  console.log(`Step 1: Get active accounts`);
  console.log(`  Found: ${accounts?.length || 0} accounts`);
  if (accountsError) {
    console.log(`  Error: ${accountsError.message}`);
  }

  if (!accounts || accounts.length === 0) {
    console.log('  ❌ No accounts found - roadmap will be empty');
    return;
  }

  const accountIds = accounts.map(a => a.id);
  console.log(`  First 3 account IDs: ${accountIds.slice(0, 3).join(', ')}`);

  // Step 2: Get account_jira_links for these accounts
  const { data: accountJiraLinks, error: linksError } = await supabase
    .from('account_jira_links')
    .select(`
      account_id,
      jira_issues!inner(
        id,
        jira_key,
        summary,
        status,
        priority,
        resolution_date,
        updated_date,
        issue_url
      )
    `)
    .in('account_id', accountIds)
    .eq('user_id', userId);

  console.log(`\nStep 2: Get account_jira_links`);
  console.log(`  Found: ${accountJiraLinks?.length || 0} links`);
  if (linksError) {
    console.log(`  Error: ${linksError.message}`);
    console.log(`  Hint: ${linksError.hint || 'N/A'}`);
    console.log(`  Details: ${linksError.details || 'N/A'}`);
  }

  if (!accountJiraLinks || accountJiraLinks.length === 0) {
    console.log('  ❌ No account_jira_links found - checking why...\n');

    // Check if links exist without the join
    const { data: rawLinks, count } = await supabase
      .from('account_jira_links')
      .select('*', { count: 'exact', head: true })
      .in('account_id', accountIds.slice(0, 10))
      .eq('user_id', userId);

    console.log(`  Raw links (without join): ${count || 0}`);

    if ((count || 0) > 0) {
      console.log('  ⚠️  Links exist but the join is failing!');
      console.log('  Possible causes:');
      console.log('    - RLS policy on jira_issues table blocking the join');
      console.log('    - Foreign key constraint issue');
      console.log('    - jira_issues rows don\'t exist for these link IDs');
    } else {
      console.log('  ⚠️  No raw links found either');
      console.log('  Checking RLS policies...');
    }

    // Test a direct query on jira_issues
    const { data: issues, count: issuesCount } = await supabase
      .from('jira_issues')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    console.log(`\n  Jira issues for user: ${issuesCount || 0}`);

    return;
  }

  // Group by account
  const accountIssueCounts = new Map<string, number>();
  accountJiraLinks.forEach((link: any) => {
    const count = accountIssueCounts.get(link.account_id) || 0;
    accountIssueCounts.set(link.account_id, count + 1);
  });

  console.log(`\n✅ Success! Found links for ${accountIssueCounts.size} accounts`);
  console.log('\nTop 5 accounts by ticket count:');

  Array.from(accountIssueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([accountId, count]) => {
      const account = accounts.find(a => a.id === accountId);
      console.log(`  ${account?.name || 'Unknown'}: ${count} tickets`);
    });
}

testRoadmapAPI().catch(console.error);
