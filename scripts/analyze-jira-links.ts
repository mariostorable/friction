/**
 * Analyze Jira link distribution and duplicates
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function analyzeJiraLinks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get match type distribution
  const { data: links, error } = await supabase
    .from('account_jira_links')
    .select('match_type, match_confidence, account_id, jira_issue_id');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nTotal account-jira links: ${links?.length || 0}\n`);

  // Group by match type
  const byMatchType: Record<string, number> = {};
  links?.forEach(link => {
    byMatchType[link.match_type] = (byMatchType[link.match_type] || 0) + 1;
  });

  console.log('Links by match type:');
  Object.entries(byMatchType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  // Check for tickets linked to multiple accounts
  const ticketToAccounts = new Map<string, Set<string>>();
  links?.forEach(link => {
    if (!ticketToAccounts.has(link.jira_issue_id)) {
      ticketToAccounts.set(link.jira_issue_id, new Set());
    }
    ticketToAccounts.get(link.jira_issue_id)!.add(link.account_id);
  });

  const multiAccountTickets = Array.from(ticketToAccounts.entries())
    .filter(([_, accounts]) => accounts.size > 1)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 10);

  console.log(`\nTickets linked to multiple accounts: ${multiAccountTickets.length}`);
  console.log('\nTop 10 tickets by account count:');

  for (const [ticketId, accounts] of multiAccountTickets) {
    const { data: ticket } = await supabase
      .from('jira_issues')
      .select('jira_key, summary')
      .eq('id', ticketId)
      .single();

    const { data: linkTypes } = await supabase
      .from('account_jira_links')
      .select('match_type')
      .eq('jira_issue_id', ticketId);

    const types = [...new Set(linkTypes?.map(l => l.match_type) || [])].join(', ');

    console.log(`  ${ticket?.jira_key}: ${accounts.size} accounts (${types})`);
    console.log(`    ${ticket?.summary.substring(0, 80)}...`);
  }

  // Get resolved tickets in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: resolvedTickets } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, resolution_date')
    .not('resolution_date', 'is', null)
    .gte('resolution_date', thirtyDaysAgo)
    .order('resolution_date', { ascending: false });

  console.log(`\n\nResolved in last 30 days: ${resolvedTickets?.length || 0}`);
  resolvedTickets?.forEach(ticket => {
    console.log(`  ${ticket.jira_key}: ${ticket.summary.substring(0, 60)}...`);
  });
}

analyzeJiraLinks().catch(console.error);
