import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  const { data: issues } = await supabase
    .from('jira_issues')
    .select('jira_key')
    .eq('user_id', userId);

  const projects = new Map<string, number>();
  issues?.forEach(issue => {
    const project = issue.jira_key.split('-')[0];
    projects.set(project, (projects.get(project) || 0) + 1);
  });

  console.log('\n=== Jira Projects in Database ===\n');
  Array.from(projects.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([project, count]) => {
      console.log(`  ${project}: ${count} tickets`);
    });

  console.log(`\nTotal: ${issues?.length || 0} Jira tickets\n`);

  // Check current account links
  const { count: linkCount } = await supabase
    .from('account_jira_links')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  console.log(`Account-Jira links: ${linkCount}\n`);

  // Sample some EDGE tickets
  const { data: edgeIssues } = await supabase
    .from('jira_issues')
    .select('jira_key, summary')
    .eq('user_id', userId)
    .ilike('jira_key', 'EDGE%')
    .limit(5);

  if (edgeIssues && edgeIssues.length > 0) {
    console.log('Sample EDGE tickets:');
    edgeIssues.forEach(issue => {
      console.log(`  ${issue.jira_key}: ${issue.summary.slice(0, 60)}`);
    });
  }

  // Check which accounts have links
  const { data: accountsWithLinks } = await supabase
    .from('account_jira_links')
    .select('account_id')
    .eq('user_id', userId);

  const uniqueAccounts = new Set(accountsWithLinks?.map(l => l.account_id));
  console.log(`\nAccounts with Jira tickets: ${uniqueAccounts.size}`);
}

check().catch(console.error);
