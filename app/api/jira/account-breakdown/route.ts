import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get all accounts in portfolios
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('account_ids')
      .eq('user_id', user.id)
      .in('portfolio_type', ['top_25_edge', 'top_25_marine', 'top_25_sitelink']);

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Collect all account IDs
    const accountIds = new Set<string>();
    portfolios.forEach(p => p.account_ids.forEach((id: string) => accountIds.add(id)));

    if (accountIds.size === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Get account details
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, arr')
      .in('id', Array.from(accountIds))
      .eq('user_id', user.id);

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Get Jira tickets linked to these accounts via account_jira_links table
    const { data: accountJiraLinks, error: linksError } = await supabase
      .from('account_jira_links')
      .select(`
        account_id,
        match_type,
        match_confidence,
        jira_issues!inner(
          id,
          jira_key,
          summary,
          status,
          resolution_date,
          issue_url
        )
      `)
      .in('account_id', Array.from(accountIds))
      .eq('user_id', user.id);

    if (linksError) {
      console.error('Error fetching account Jira links:', linksError);
      return NextResponse.json({ accounts: [] });
    }

    if (!accountJiraLinks || accountJiraLinks.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Get theme links for tickets (for display purposes)
    const jiraIssueIds = new Set(accountJiraLinks.map((link: any) => link.jira_issues.id));
    const { data: themeLinks } = await supabase
      .from('theme_jira_links')
      .select('jira_issue_id, theme_key')
      .in('jira_issue_id', Array.from(jiraIssueIds))
      .eq('user_id', user.id);

    // Build ticket -> themes mapping
    const ticketThemes = new Map<string, Set<string>>();
    themeLinks?.forEach((link: any) => {
      if (!ticketThemes.has(link.jira_issue_id)) {
        ticketThemes.set(link.jira_issue_id, new Set());
      }
      ticketThemes.get(link.jira_issue_id)!.add(link.theme_key);
    });

    // Get case counts for each account-ticket combination
    const { data: frictionCards } = await supabase
      .from('friction_cards')
      .select(`
        account_id,
        theme_key,
        raw_input:raw_inputs!inner(source_id)
      `)
      .in('account_id', Array.from(accountIds))
      .eq('user_id', user.id)
      .eq('is_friction', true)
      .not('raw_inputs.source_id', 'is', null);

    // Build account -> case IDs mapping
    const accountCaseIds = new Map<string, Set<string>>();
    frictionCards?.forEach((card: any) => {
      const caseId = card.raw_input?.source_id;
      if (caseId) {
        if (!accountCaseIds.has(card.account_id)) {
          accountCaseIds.set(card.account_id, new Set());
        }
        accountCaseIds.get(card.account_id)!.add(caseId);
      }
    });

    // Build account-level data
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const accountData = accounts.map(account => {
      const accountLinks = accountJiraLinks.filter((link: any) => link.account_id === account.id);
      const tickets = new Map<string, any>(); // jira_key -> ticket details

      let resolved_30d = 0;
      let in_progress = 0;
      let open = 0;

      accountLinks.forEach((link: any) => {
        const ticket = link.jira_issues;
        if (!tickets.has(ticket.jira_key)) {
          tickets.set(ticket.jira_key, {
            ...ticket,
            themes: ticketThemes.get(ticket.id) || new Set(),
            match_type: link.match_type,
            match_confidence: link.match_confidence
          });

          // Count ticket status
          if (ticket.resolution_date) {
            const resolvedDate = new Date(ticket.resolution_date);
            if (resolvedDate >= thirtyDaysAgo) {
              resolved_30d++;
            }
          } else {
            const statusLower = ticket.status?.toLowerCase() || '';
            if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
              in_progress++;
            } else {
              open++;
            }
          }
        }
      });

      const accountCases = accountCaseIds.get(account.id) || new Set();

      const ticketList = Array.from(tickets.values()).map(ticket => ({
        jira_key: ticket.jira_key,
        summary: ticket.summary,
        status: ticket.status,
        issue_url: ticket.issue_url,
        theme_keys: Array.from(ticket.themes),
        case_count: accountCases.size, // Total cases for this account
        match_type: ticket.match_type,
        match_confidence: ticket.match_confidence
      }));

      return {
        accountId: account.id,
        accountName: account.name,
        arr: account.arr,
        resolved_30d,
        in_progress,
        open,
        total: resolved_30d + in_progress + open,
        tickets: ticketList
      };
    });

    // Filter to only accounts with tickets
    const accountsWithTickets = accountData.filter(a => a.total > 0);

    return NextResponse.json({
      accounts: accountsWithTickets
    });

  } catch (error) {
    console.error('Error fetching account Jira breakdown:', error);
    return NextResponse.json({
      error: 'Failed to fetch account breakdown',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
