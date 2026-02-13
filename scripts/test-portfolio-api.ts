import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testPortfolioAPI() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Testing Portfolio API Logic ===\n');

  // Step 1: Get all portfolio account IDs (same as API)
  const portfolioTypes = ['top_25_edge', 'top_25_marine', 'top_25_sitelink'];

  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('account_ids, portfolio_type')
    .eq('user_id', userId)
    .in('portfolio_type', portfolioTypes);

  const allAccountIds = new Set<string>();
  portfolios?.forEach(p => p.account_ids.forEach((id: string) => allAccountIds.add(id)));
  const accountIds = Array.from(allAccountIds);

  console.log(`Portfolio account IDs: ${accountIds.length}`);
  portfolios?.forEach(p => {
    console.log(`  ${p.portfolio_type}: ${p.account_ids.length} accounts`);
  });

  // Step 2: Get account-jira links (same as API)
  const { data: accountJiraLinks } = await supabase
    .from('account_jira_links')
    .select(`
      account_id,
      jira_issues!inner(
        id,
        status,
        resolution_date
      )
    `)
    .in('account_id', accountIds)
    .eq('user_id', userId);

  console.log(`\nAccount-Jira links found: ${accountJiraLinks?.length || 0}`);

  // Step 3: Group by account (same logic as API)
  const accountTickets: Record<string, Map<string, any>> = {};
  accountJiraLinks?.forEach((link: any) => {
    const accountId = link.account_id;
    const ticket = link.jira_issues;

    if (!accountTickets[accountId]) {
      accountTickets[accountId] = new Map();
    }

    if (!accountTickets[accountId].has(ticket.id)) {
      accountTickets[accountId].set(ticket.id, ticket);
    }
  });

  console.log(`Accounts with Jira tickets: ${Object.keys(accountTickets).length}`);

  // Step 4: Calculate counts
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const accountTicketCounts: Record<string, { resolved_30d: number; in_progress: number; open: number }> = {};

  accountIds.forEach(accountId => {
    accountTicketCounts[accountId] = { resolved_30d: 0, in_progress: 0, open: 0 };
  });

  Object.entries(accountTickets).forEach(([accountId, ticketsMap]) => {
    ticketsMap.forEach((ticket) => {
      if (ticket.resolution_date) {
        const resolvedDate = new Date(ticket.resolution_date);
        if (resolvedDate >= thirtyDaysAgo) {
          accountTicketCounts[accountId].resolved_30d++;
        }
      } else {
        const statusLower = ticket.status?.toLowerCase() || '';
        if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
          accountTicketCounts[accountId].in_progress++;
        } else {
          accountTicketCounts[accountId].open++;
        }
      }
    });
  });

  // Show results
  const accountsWithTickets = Object.entries(accountTicketCounts)
    .filter(([_, counts]) => counts.resolved_30d > 0 || counts.in_progress > 0 || counts.open > 0);

  console.log(`\nAccounts with non-zero counts: ${accountsWithTickets.length}\n`);

  // Get account names
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .in('id', accountIds);

  accountsWithTickets.slice(0, 15).forEach(([accountId, counts]) => {
    const account = accounts?.find(a => a.id === accountId);
    const total = counts.resolved_30d + counts.in_progress + counts.open;
    console.log(`${account?.name || 'Unknown'}:`);
    console.log(`  ${counts.resolved_30d} / ${counts.in_progress} / ${counts.open} (total: ${total})`);
  });

  const accountsWithZero = accountIds.length - accountsWithTickets.length;
  console.log(`\n❌ Accounts with 0/0/0: ${accountsWithZero} out of ${accountIds.length}`);
}

testPortfolioAPI().catch(console.error);
