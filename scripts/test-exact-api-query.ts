import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testExactQuery() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Testing Exact API Query ===\n');

  // Step 1: Get accounts from portfolios (like the dashboard does)
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('account_ids')
    .eq('user_id', userId)
    .in('portfolio_type', ['top_25_edge', 'top_25_marine', 'top_25_sitelink']);

  const portfolioAccountIds = new Set<string>();
  portfolios?.forEach(p => p.account_ids.forEach((id: string) => portfolioAccountIds.add(id)));

  console.log(`Step 1: Portfolio accounts: ${portfolioAccountIds.size}`);

  // Step 2: Get account_jira_links for ONLY portfolio accounts
  const accountIds = Array.from(portfolioAccountIds);

  console.log(`\nStep 2: Querying account_jira_links for ${accountIds.length} portfolio accounts`);

  const { data: links1, error: error1 } = await supabase
    .from('account_jira_links')
    .select('account_id, jira_issue_id')
    .in('account_id', accountIds)
    .eq('user_id', userId);

  console.log(`  Without join: ${links1?.length || 0} links`);
  if (error1) console.log(`  Error: ${error1.message}`);

  // Step 3: Try with jira_issues join
  const { data: links2, error: error2 } = await supabase
    .from('account_jira_links')
    .select(`
      account_id,
      jira_issues(
        id,
        jira_key,
        summary,
        status
      )
    `)
    .in('account_id', accountIds)
    .eq('user_id', userId)
    .limit(5);

  console.log(`\n  With jira_issues(*) join: ${links2?.length || 0} links`);
  if (error2) {
    console.log(`  Error: ${error2.message}`);
    console.log(`  Code: ${error2.code}`);
  }
  if (links2 && links2.length > 0) {
    console.log('  Sample:', JSON.stringify(links2[0], null, 2));
  }

  // Step 4: Try with !inner
  const { data: links3, error: error3 } = await supabase
    .from('account_jira_links')
    .select(`
      account_id,
      jira_issues!inner(
        id,
        jira_key,
        summary,
        status
      )
    `)
    .in('account_id', accountIds)
    .eq('user_id', userId)
    .limit(5);

  console.log(`\n  With jira_issues!inner() join: ${links3?.length || 0} links`);
  if (error3) {
    console.log(`  Error: ${error3.message}`);
    console.log(`  Code: ${error3.code}`);
    console.log(`  Hint: ${error3.hint}`);
    console.log(`  Details: ${error3.details}`);
  }
  if (links3 && links3.length > 0) {
    console.log('  ✓ Inner join works!');
  }

  // Check if any links exist for portfolio accounts
  if (links1 && links1.length > 0) {
    console.log(`\n--- Link Analysis ---`);
    const accountsWithLinks = new Set(links1.map(l => l.account_id));
    console.log(`  Unique accounts with links: ${accountsWithLinks.size}`);
    console.log(`  Total links: ${links1.length}`);

    // Count per account
    const countsMap = new Map<string, number>();
    links1.forEach(link => {
      countsMap.set(link.account_id, (countsMap.get(link.account_id) || 0) + 1);
    });

    console.log(`\n  Top 5 accounts by link count:`);
    Array.from(countsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([accountId, count]) => {
        const { data: acc } = supabase
          .from('accounts')
          .select('name')
          .eq('id', accountId)
          .single()
          .then(res => {
            console.log(`    ${res.data?.name || accountId}: ${count} links`);
          });
      });
  } else {
    console.log(`\n⚠️  No links found for portfolio accounts!`);
  }
}

testExactQuery().catch(console.error);
