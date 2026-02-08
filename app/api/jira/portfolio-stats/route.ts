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

    // Get all friction themes across portfolio (from analyzed accounts)
    const { data: allThemes } = await supabase
      .from('friction_cards')
      .select('theme_key, severity, account_id, accounts(name, arr)')
      .eq('user_id', user.id);

    if (!allThemes || allThemes.length === 0) {
      return NextResponse.json({
        portfolio: { resolved_7d: 0, resolved_30d: 0, resolved_90d: 0, in_progress: 0, open: 0 },
        topThemes: [],
        accountsByIssue: [],
        accountTicketCounts: {}
      });
    }

    // Calculate theme weights across portfolio
    const themeWeights: Record<string, { count: number; avgSeverity: number; weight: number; accounts: Set<string> }> = {};

    allThemes.forEach((item: any) => {
      const theme = item.theme_key;
      if (!themeWeights[theme]) {
        themeWeights[theme] = { count: 0, avgSeverity: 0, weight: 0, accounts: new Set() };
      }
      themeWeights[theme].count++;
      themeWeights[theme].avgSeverity += item.severity || 3;
      themeWeights[theme].accounts.add(item.account_id);
    });

    Object.keys(themeWeights).forEach(theme => {
      const stats = themeWeights[theme];
      stats.avgSeverity = stats.avgSeverity / stats.count;
      stats.weight = stats.count * stats.avgSeverity;
    });

    const themeKeys = Object.keys(themeWeights);

    // Get all Jira issues linked to these themes
    const { data: jiraLinks } = await supabase
      .from('theme_jira_links')
      .select(`
        theme_key,
        match_confidence,
        jira_issues!inner(
          id,
          jira_key,
          summary,
          status,
          priority,
          resolution_date,
          updated_date,
          issue_url
        )
      `)
      .in('theme_key', themeKeys)
      .eq('jira_issues.user_id', user.id);

    // Aggregate portfolio-level stats
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    let resolved_7d = 0;
    let resolved_30d = 0;
    let resolved_90d = 0;
    let in_progress = 0;
    let open_count = 0;

    const issuesByTheme: Record<string, any[]> = {};

    jiraLinks?.forEach((link: any) => {
      const issue = link.jira_issues;
      const themeKey = link.theme_key;

      if (!issuesByTheme[themeKey]) {
        issuesByTheme[themeKey] = [];
      }
      issuesByTheme[themeKey].push(issue);

      if (issue.resolution_date) {
        const resolvedDate = new Date(issue.resolution_date);
        if (resolvedDate >= sevenDaysAgo) resolved_7d++;
        if (resolvedDate >= thirtyDaysAgo) resolved_30d++;
        if (resolvedDate >= ninetyDaysAgo) resolved_90d++;
      } else {
        const statusLower = issue.status?.toLowerCase() || '';
        if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
          in_progress++;
        } else {
          open_count++;
        }
      }
    });

    // Top themes affecting multiple accounts
    const topThemes = Object.entries(themeWeights)
      .filter(([theme]) => issuesByTheme[theme]?.length > 0)
      .map(([theme, stats]) => ({
        theme_key: theme,
        case_count: stats.count,
        account_count: stats.accounts.size,
        avg_severity: stats.avgSeverity,
        ticket_count: issuesByTheme[theme]?.length || 0,
        tickets: issuesByTheme[theme] || []
      }))
      .sort((a, b) => b.account_count - a.account_count)
      .slice(0, 10);

    // Group accounts by shared issues (find issues affecting 2+ accounts)
    const issueToAccounts: Record<string, Set<string>> = {};

    allThemes.forEach((item: any) => {
      const theme = item.theme_key;
      const tickets = issuesByTheme[theme] || [];
      tickets.forEach((ticket: any) => {
        if (!issueToAccounts[ticket.jira_key]) {
          issueToAccounts[ticket.jira_key] = new Set();
        }
        issueToAccounts[ticket.jira_key].add(item.account_id);
      });
    });

    const accountsByIssue = Object.entries(issueToAccounts)
      .filter(([_, accounts]) => accounts.size >= 2)
      .map(([jiraKey, accountIds]) => {
        const ticket: any = jiraLinks?.find((l: any) => l.jira_issues?.jira_key === jiraKey)?.jira_issues;
        const affectedAccounts = Array.from(accountIds).map(accountId => {
          const acc = allThemes.find((t: any) => t.account_id === accountId);
          const accountData = acc?.accounts as any;
          return {
            id: accountId,
            name: accountData?.name || 'Unknown',
            arr: accountData?.arr || 0
          };
        });

        return {
          jira_key: jiraKey,
          summary: ticket?.summary || '',
          status: ticket?.status || 'Unknown',
          issue_url: ticket?.issue_url || '#',
          affected_accounts: affectedAccounts,
          impact_score: affectedAccounts.reduce((sum, a) => sum + (a.arr || 0), 0)
        };
      })
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, 20);

    // Per-account ticket counts (using account_jira_links as single source of truth)
    const accountIds = Array.from(new Set(allThemes.map((t: any) => t.account_id)));

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
      .eq('user_id', user.id);

    const accountTicketCounts: Record<string, { resolved_30d: number; in_progress: number; open: number }> = {};

    // Initialize all accounts with zero counts
    accountIds.forEach(accountId => {
      accountTicketCounts[accountId] = { resolved_30d: 0, in_progress: 0, open: 0 };
    });

    // Count tickets per account
    accountJiraLinks?.forEach((link: any) => {
      const accountId = link.account_id;
      const ticket = link.jira_issues;

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

    return NextResponse.json({
      portfolio: {
        resolved_7d,
        resolved_30d,
        resolved_90d,
        in_progress,
        open: open_count
      },
      topThemes,
      accountsByIssue,
      accountTicketCounts
    });

  } catch (error) {
    console.error('Error fetching portfolio Jira stats:', error);
    return NextResponse.json({
      error: 'Failed to fetch portfolio stats',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
