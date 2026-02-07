import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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
      .in('portfolio_type', ['top_25_edge', 'top_25_marine']);

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

    // Get friction cards for these accounts
    const { data: frictionCards } = await supabase
      .from('friction_cards')
      .select('account_id, theme_key')
      .in('account_id', Array.from(accountIds))
      .eq('user_id', user.id);

    // Group themes by account
    const accountThemes: Record<string, Set<string>> = {};
    frictionCards?.forEach(card => {
      if (!accountThemes[card.account_id]) {
        accountThemes[card.account_id] = new Set();
      }
      accountThemes[card.account_id].add(card.theme_key);
    });

    // Get all unique themes
    const allThemes = new Set<string>();
    Object.values(accountThemes).forEach(themes => {
      themes.forEach(theme => allThemes.add(theme));
    });

    if (allThemes.size === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Get Jira issues linked to these themes
    const { data: jiraLinks } = await supabase
      .from('theme_jira_links')
      .select(`
        theme_key,
        jira_issues!inner(
          id,
          jira_key,
          summary,
          status,
          resolution_date,
          issue_url
        )
      `)
      .in('theme_key', Array.from(allThemes))
      .eq('user_id', user.id);

    // Build theme -> tickets mapping
    const themeTickets: Record<string, any[]> = {};
    jiraLinks?.forEach((link: any) => {
      const theme = link.theme_key;
      const ticket = link.jira_issues;
      if (!themeTickets[theme]) {
        themeTickets[theme] = [];
      }
      // Avoid duplicates
      if (!themeTickets[theme].find(t => t.jira_key === ticket.jira_key)) {
        themeTickets[theme].push(ticket);
      }
    });

    // Get case counts for each theme-account combination
    const { data: frictionCardCounts } = await supabase
      .from('friction_cards')
      .select('account_id, theme_key, id')
      .in('account_id', Array.from(accountIds))
      .eq('user_id', user.id);

    const themeCaseCounts: Record<string, Record<string, number>> = {};
    frictionCardCounts?.forEach(card => {
      const key = `${card.account_id}-${card.theme_key}`;
      themeCaseCounts[key] = (themeCaseCounts[key] || 0) + 1;
    });

    // Build account-level data
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const accountData = accounts.map(account => {
      const themes = accountThemes[account.id] || new Set();
      const tickets = new Map<string, any>(); // jira_key -> ticket details
      const ticketThemes = new Map<string, Set<string>>(); // jira_key -> themes
      const ticketCaseCounts = new Map<string, number>(); // jira_key -> case count

      let resolved_7d = 0;
      let in_progress = 0;
      let open = 0;

      // For each theme this account has, collect related tickets
      themes.forEach(theme => {
        const themeTicketList = themeTickets[theme] || [];
        themeTicketList.forEach(ticket => {
          if (!tickets.has(ticket.jira_key)) {
            tickets.set(ticket.jira_key, ticket);
            ticketThemes.set(ticket.jira_key, new Set());
            ticketCaseCounts.set(ticket.jira_key, 0);
          }
          ticketThemes.get(ticket.jira_key)!.add(theme);

          // Add case count for this theme-account combination
          const caseCountKey = `${account.id}-${theme}`;
          const caseCount = themeCaseCounts[caseCountKey] || 0;
          ticketCaseCounts.set(ticket.jira_key, ticketCaseCounts.get(ticket.jira_key)! + caseCount);

          // Count ticket status
          if (ticket.resolution_date) {
            const resolvedDate = new Date(ticket.resolution_date);
            if (resolvedDate >= sevenDaysAgo) {
              resolved_7d++;
            }
          } else {
            const statusLower = ticket.status?.toLowerCase() || '';
            if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
              in_progress++;
            } else {
              open++;
            }
          }
        });
      });

      const ticketList = Array.from(tickets.values()).map(ticket => ({
        jira_key: ticket.jira_key,
        summary: ticket.summary,
        status: ticket.status,
        issue_url: ticket.issue_url,
        theme_keys: Array.from(ticketThemes.get(ticket.jira_key) || []),
        case_count: ticketCaseCounts.get(ticket.jira_key) || 0
      }));

      return {
        accountId: account.id,
        accountName: account.name,
        arr: account.arr,
        resolved_7d,
        in_progress,
        open,
        total: resolved_7d + in_progress + open,
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
