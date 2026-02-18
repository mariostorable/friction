import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkWestport() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Westport Properties Analysis ===\n');

  // Find Westport
  const { data: westport } = await supabase
    .from('accounts')
    .select('id, name, products, vertical')
    .eq('user_id', userId)
    .ilike('name', '%westport%')
    .single();

  if (!westport) {
    console.log('Westport not found');
    return;
  }

  console.log('Account:', westport.name);
  console.log('Products:', westport.products);
  console.log('Vertical:', westport.vertical);

  // Get Jira links
  const { data: links } = await supabase
    .from('account_jira_links')
    .select('jira_issue_id, match_type, match_confidence, jira_issues(jira_key, summary)')
    .eq('user_id', userId)
    .eq('account_id', westport.id);

  console.log(`\nTotal Jira links: ${links?.length || 0}\n`);

  if (links && links.length > 0) {
    // Count by project
    const projectCounts = new Map<string, number>();
    links.forEach((link: any) => {
      const project = link.jira_issues.jira_key.split('-')[0];
      projectCounts.set(project, (projectCounts.get(project) || 0) + 1);
    });

    console.log('Tickets by project:');
    Array.from(projectCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([project, count]) => {
        console.log(`  ${project}: ${count} tickets`);
      });

    // Show NBK tickets
    const nbkTickets = links.filter((link: any) => link.jira_issues.jira_key.startsWith('NBK-'));
    console.log(`\nNBK tickets (should be 0 for storage account):`);
    nbkTickets.slice(0, 5).forEach((link: any) => {
      console.log(`  ${link.jira_issues.jira_key}: ${link.jira_issues.summary}`);
    });

    // Show EDGE tickets
    const edgeTickets = links.filter((link: any) => link.jira_issues.jira_key.startsWith('EDGE-'));
    console.log(`\nEDGE tickets (Westport uses SiteLink, not EDGE):`);
    edgeTickets.slice(0, 5).forEach((link: any) => {
      console.log(`  ${link.jira_issues.jira_key}: ${link.jira_issues.summary}`);
    });
  }
}

checkWestport().catch(console.error);
