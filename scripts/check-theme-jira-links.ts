import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkThemeLinks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Checking Theme-Jira Links ===\n');

  // Check a specific account: William Warren Group
  const { data: williamWarren } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', '%William Warren%')
    .single();

  if (!williamWarren) {
    console.log('William Warren not found');
    return;
  }

  console.log(`Account: ${williamWarren.name}\n`);

  // Get friction themes for this account
  const { data: themes } = await supabase
    .from('friction_cards')
    .select('theme_key')
    .eq('user_id', userId)
    .eq('account_id', williamWarren.id)
    .limit(10);

  console.log(`Friction themes: ${themes?.length || 0}`);
  const themeKeys = themes?.map(t => t.theme_key) || [];
  console.log(`Sample themes: ${themeKeys.slice(0, 5).join(', ')}\n`);

  if (themeKeys.length === 0) {
    console.log('No themes found');
    return;
  }

  // Check if these themes are linked to any Jira tickets
  const { data: themeJiraLinks } = await supabase
    .from('theme_jira_links')
    .select('theme_key, jira_issue_id, match_confidence')
    .eq('user_id', userId)
    .in('theme_key', themeKeys);

  console.log(`Theme-Jira links for these themes: ${themeJiraLinks?.length || 0}\n`);

  if (themeJiraLinks && themeJiraLinks.length > 0) {
    // Get the actual Jira issues
    const jiraIssueIds = themeJiraLinks.map(l => l.jira_issue_id);
    const { data: jiraIssues } = await supabase
      .from('jira_issues')
      .select('id, jira_key, summary')
      .in('id', jiraIssueIds);

    console.log('Sample Jira tickets linked to these themes:');
    jiraIssues?.slice(0, 5).forEach(issue => {
      console.log(`  ${issue.jira_key}: ${issue.summary.slice(0, 60)}`);
    });

    // Now check: why aren't these creating account_jira_links?
    console.log('\n🔍 Checking account_jira_links for these Jira issues...\n');

    const { data: accountLinks } = await supabase
      .from('account_jira_links')
      .select('account_id, jira_issue_id, match_type')
      .eq('user_id', userId)
      .in('jira_issue_id', jiraIssueIds);

    console.log(`Account-Jira links for these issues: ${accountLinks?.length || 0}`);

    if (accountLinks && accountLinks.length > 0) {
      // Count by account
      const byAccount = new Map<string, number>();
      accountLinks.forEach(link => {
        byAccount.set(link.account_id, (byAccount.get(link.account_id) || 0) + 1);
      });

      console.log(`Linked to ${byAccount.size} accounts:`);

      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name')
        .in('id', Array.from(byAccount.keys()));

      Array.from(byAccount.entries()).slice(0, 10).forEach(([accountId, count]) => {
        const account = accounts?.find(a => a.id === accountId);
        const isWilliamWarren = accountId === williamWarren.id;
        console.log(`  ${account?.name || 'Unknown'}: ${count} tickets${isWilliamWarren ? ' ← THIS IS WILLIAM WARREN!' : ''}`);
      });

      // Check specifically for William Warren
      const williamWarrenLinks = accountLinks.filter(l => l.account_id === williamWarren.id);
      if (williamWarrenLinks.length === 0) {
        console.log(`\n❌ William Warren is NOT in account_jira_links, even though theme_jira_links exist!`);
        console.log(`\nThis means the sync is NOT creating account_jira_links from theme_jira_links.`);
      } else {
        console.log(`\n✅ William Warren has ${williamWarrenLinks.length} account_jira_links`);
      }
    } else {
      console.log('\n❌ No account_jira_links exist for these Jira issues!');
      console.log('This means theme_jira_links exist but are not being converted to account_jira_links.');
    }
  } else {
    console.log('❌ No theme-Jira links found!');
    console.log('This means the Jira sync is not matching tickets to these friction themes.');
  }
}

checkThemeLinks().catch(console.error);
