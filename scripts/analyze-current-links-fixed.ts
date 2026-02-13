import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function analyzeLinks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Analyzing Current Account-Jira Links ===\n');

  // Get all current links
  const { data: links } = await supabase
    .from('account_jira_links')
    .select('jira_issue_id, account_id, match_type, match_confidence')
    .eq('user_id', userId);

  console.log(`Total links: ${links?.length || 0}\n`);

  if (!links || links.length === 0) {
    console.log('No links found!');
    return;
  }

  // Get Jira issues for link details
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('id, jira_key')
    .eq('user_id', userId);

  const issueIdToKey = new Map<string, string>();
  issues?.forEach(issue => {
    issueIdToKey.set(issue.id, issue.jira_key);
  });

  // Group by match type
  const byMatchType = new Map<string, number>();
  links.forEach(link => {
    const matchType = link.match_type || 'unknown';
    byMatchType.set(matchType, (byMatchType.get(matchType) || 0) + 1);
  });

  console.log('Links by match type:');
  Array.from(byMatchType.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([matchType, count]) => {
      console.log(`  ${matchType}: ${count}`);
    });

  // Get accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active');

  // Group by account
  const linksByAccount = new Map<string, string[]>();
  links.forEach(link => {
    if (!linksByAccount.has(link.account_id)) {
      linksByAccount.set(link.account_id, []);
    }
    const jiraKey = issueIdToKey.get(link.jira_issue_id) || 'Unknown';
    linksByAccount.get(link.account_id)?.push(jiraKey);
  });

  console.log(`\nUnique accounts with links: ${linksByAccount.size}\n`);

  // Show accounts with most tickets
  console.log('Top accounts by Jira ticket count:\n');
  const accountCounts = Array.from(linksByAccount.entries())
    .map(([accountId, jiraKeys]) => ({
      accountId,
      name: accounts?.find(a => a.id === accountId)?.name || 'Unknown',
      count: jiraKeys.length,
      tickets: jiraKeys
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  accountCounts.forEach(acc => {
    console.log(`${acc.name}:`);
    console.log(`  ${acc.count} tickets: ${acc.tickets.slice(0, 5).join(', ')}${acc.count > 5 ? '...' : ''}`);
    console.log('');
  });

  // Show match types for top account
  if (accountCounts.length > 0) {
    const topAccount = accountCounts[0];
    const topAccountLinks = links.filter(l => l.account_id === topAccount.accountId);

    console.log(`\nMatch types for "${topAccount.name}":`);
    const matchTypes = new Map<string, number>();
    topAccountLinks.forEach(link => {
      const matchType = link.match_type || 'unknown';
      matchTypes.set(matchType, (matchTypes.get(matchType) || 0) + 1);
    });

    Array.from(matchTypes.entries()).forEach(([matchType, count]) => {
      console.log(`  ${matchType}: ${count}`);
    });
  }
}

analyzeLinks().catch(console.error);
