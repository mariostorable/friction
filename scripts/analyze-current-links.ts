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

  // Get all current links with account and ticket info
  const { data: links } = await supabase
    .from('account_jira_links')
    .select('jira_key, account_id, match_strategy, confidence_score')
    .eq('user_id', userId);

  console.log(`Total links: ${links?.length || 0}\n`);

  // Group by match strategy
  const byStrategy = new Map<string, number>();
  links?.forEach(link => {
    const strategy = link.match_strategy || 'unknown';
    byStrategy.set(strategy, (byStrategy.get(strategy) || 0) + 1);
  });

  console.log('Links by strategy:');
  Array.from(byStrategy.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([strategy, count]) => {
      console.log(`  ${strategy}: ${count}`);
    });

  // Get accounts with links
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active');

  // Show some example links
  console.log('\n\nSample links:\n');
  const linksByAccount = new Map<string, string[]>();
  links?.forEach(link => {
    if (!linksByAccount.has(link.account_id)) {
      linksByAccount.set(link.account_id, []);
    }
    linksByAccount.get(link.account_id)?.push(link.jira_key);
  });

  let shown = 0;
  for (const [accountId, jiraKeys] of linksByAccount.entries()) {
    if (shown >= 10) break;

    const account = accounts?.find(a => a.id === accountId);
    console.log(`${account?.name || 'Unknown'} (${accountId.slice(0, 8)}...):`);
    console.log(`  ${jiraKeys.length} tickets: ${jiraKeys.slice(0, 5).join(', ')}${jiraKeys.length > 5 ? '...' : ''}`);
    console.log('');
    shown++;
  }

  // Show accounts with most tickets
  console.log('\nAccounts with most Jira tickets:\n');
  const accountCounts = Array.from(linksByAccount.entries())
    .map(([accountId, jiraKeys]) => ({
      accountId,
      name: accounts?.find(a => a.id === accountId)?.name || 'Unknown',
      count: jiraKeys.length
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  accountCounts.forEach(acc => {
    console.log(`  ${acc.name}: ${acc.count} tickets`);
  });
}

analyzeLinks().catch(console.error);
