import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkAccounts() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Analyzing Accounts Without Jira Tickets ===\n');

  // Get portfolio accounts
  const portfolioTypes = ['top_25_edge', 'top_25_marine', 'top_25_sitelink'];
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('account_ids')
    .eq('user_id', userId)
    .in('portfolio_type', portfolioTypes);

  const allAccountIds = new Set<string>();
  portfolios?.forEach(p => p.account_ids.forEach((id: string) => allAccountIds.add(id)));
  const accountIds = Array.from(allAccountIds);

  // Get accounts with Jira links
  const { data: accountJiraLinks } = await supabase
    .from('account_jira_links')
    .select('account_id')
    .in('account_id', accountIds)
    .eq('user_id', userId);

  const accountsWithJira = new Set(accountJiraLinks?.map(l => l.account_id));

  // Get accounts WITHOUT Jira links
  const accountsWithoutJira = accountIds.filter(id => !accountsWithJira.has(id));

  console.log(`Accounts without Jira: ${accountsWithoutJira.length}`);

  // Check how many have friction themes
  const { data: frictionCards } = await supabase
    .from('friction_cards')
    .select('account_id, theme_key')
    .eq('user_id', userId)
    .in('account_id', accountsWithoutJira);

  const accountsWithThemes = new Set(frictionCards?.map(c => c.account_id));

  console.log(`Accounts with friction themes: ${accountsWithThemes.size}`);
  console.log(`Accounts WITHOUT friction themes: ${accountsWithoutJira.length - accountsWithThemes.size}\n`);

  // Get account details
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, arr')
    .eq('user_id', userId)
    .in('id', accountsWithoutJira);

  // Show accounts without Jira, split by whether they have themes
  const withThemes = accountsWithoutJira.filter(id => accountsWithThemes.has(id));
  const withoutThemes = accountsWithoutJira.filter(id => !accountsWithThemes.has(id));

  console.log('=== Accounts with themes but NO Jira tickets (should be matched!) ===\n');
  withThemes.slice(0, 10).forEach(id => {
    const account = accounts?.find(a => a.id === id);
    const themeCount = frictionCards?.filter(c => c.account_id === id).length || 0;
    console.log(`${account?.name || 'Unknown'} (${themeCount} themes)`);
  });

  if (withThemes.length > 10) {
    console.log(`... and ${withThemes.length - 10} more\n`);
  }

  console.log(`\n=== Accounts WITHOUT themes (need Salesforce sync) ===\n`);
  withoutThemes.slice(0, 10).forEach(id => {
    const account = accounts?.find(a => a.id === id);
    console.log(`${account?.name || 'Unknown'}`);
  });

  if (withoutThemes.length > 10) {
    console.log(`... and ${withoutThemes.length - 10} more\n`);
  }

  // Check: Do those accounts with themes match ANY Jira ticket client fields?
  console.log('\n=== Testing Client Field Matching for Accounts with Themes ===\n');

  const { data: jiraIssues } = await supabase
    .from('jira_issues')
    .select('jira_key, metadata')
    .eq('user_id', userId);

  let potentialMatches = 0;

  withThemes.slice(0, 5).forEach(accountId => {
    const account = accounts?.find(a => a.id === accountId);
    if (!account) return;

    const accountName = account.name.toLowerCase();

    // Check if ANY Jira ticket's client field matches this account
    jiraIssues?.forEach(issue => {
      const customFields = issue.metadata?.custom_fields || {};
      const clientFieldValue = customFields['customfield_12184'];

      if (clientFieldValue && typeof clientFieldValue === 'string') {
        const clientNames = clientFieldValue
          .split(/[;,]/)
          .map((name: string) => name.trim().toLowerCase());

        if (clientNames.some(cn => accountName.includes(cn) || cn.includes(accountName.split(' ')[0]))) {
          potentialMatches++;
          console.log(`  ✓ ${account.name} could match ${issue.jira_key} (client: ${clientFieldValue})`);
        }
      }
    });
  });

  if (potentialMatches === 0) {
    console.log('  ❌ No potential matches found via client field');
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Accounts in portfolios: ${accountIds.length}`);
  console.log(`  Accounts with Jira: ${accountsWithJira.size}`);
  console.log(`  Accounts without Jira: ${accountsWithoutJira.length}`);
  console.log(`    - With themes (ready to match): ${withThemes.length}`);
  console.log(`    - Without themes (need sync): ${withoutThemes.length}`);
}

checkAccounts().catch(console.error);
