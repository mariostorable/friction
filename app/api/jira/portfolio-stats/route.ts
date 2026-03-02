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

    // Get vertical filter from query params
    const searchParams = request.nextUrl.searchParams;
    const vertical = searchParams.get('vertical') as 'storage' | 'marine' | null;

    // Get all friction themes across portfolio (from analyzed accounts)
    let themesQuery = supabase
      .from('friction_cards')
      .select('theme_key, severity, account_id, accounts(name, arr, vertical)')
      .eq('user_id', user.id);

    // Filter by vertical if specified
    if (vertical) {
      themesQuery = themesQuery.eq('accounts.vertical', vertical);
    }

    const { data: allThemes } = await themesQuery;

    if (!allThemes || allThemes.length === 0) {
      return NextResponse.json({
        portfolio: { resolved_60d: 0, resolved_120d: 0, in_progress: 0, open: 0 },
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

    // Internal/ops issue types excluded from CS-facing views
    const OPS_ISSUE_TYPES = ['Operational Work', 'Data Fix', 'Vendor'];

    // Get all Jira issues linked to these themes (theme view uses theme_jira_links - correct)
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
          issue_type,
          priority,
          resolution,
          resolution_date,
          updated_date,
          issue_url
        )
      `)
      .in('theme_key', themeKeys)
      .eq('jira_issues.user_id', user.id);

    // Aggregate portfolio-level stats
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const oneHundredTwentyDaysAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let resolved_60d = 0;
    let resolved_120d = 0;
    let in_progress = 0;
    let open_count = 0;

    const issuesByTheme: Record<string, any[]> = {};

    // Status categorization helpers
    const IN_PROGRESS_STATUSES = [
      'in progress', 'dev testing', 'deployed to staging',
      'selected for deployment', 'staging testing',
      'in product refinement', 'requirements review'
    ];

    jiraLinks?.forEach((link: any) => {
      const issue = link.jira_issues;
      const themeKey = link.theme_key;

      // Skip ops issue types
      if (OPS_ISSUE_TYPES.includes(issue.issue_type)) return;

      if (!issuesByTheme[themeKey]) {
        issuesByTheme[themeKey] = [];
      }
      issuesByTheme[themeKey].push(issue);

      const statusLower = issue.status?.toLowerCase() || '';
      const resolutionLower = issue.resolution?.toLowerCase() || '';
      const isResolved =
        statusLower === 'closed' &&
        (resolutionLower === 'done' || resolutionLower === 'duplicate' || resolutionLower === 'cannot reproduce');

      if (isResolved && issue.resolution_date) {
        const resolvedDate = new Date(issue.resolution_date);
        if (resolvedDate >= sixtyDaysAgo) resolved_60d++;
        if (resolvedDate >= oneHundredTwentyDaysAgo) resolved_120d++;
      } else if (IN_PROGRESS_STATUSES.some(s => statusLower.includes(s))) {
        in_progress++;
      } else if (!isResolved) {
        open_count++;
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
    // Get ALL accounts from portfolios, not just those with friction_cards
    let portfolioTypes = ['top_25_edge', 'top_25_marine', 'top_25_sitelink'];

    // Filter portfolio types by vertical if specified
    if (vertical === 'marine') {
      portfolioTypes = ['top_25_marine'];
    } else if (vertical === 'storage') {
      portfolioTypes = ['top_25_edge', 'top_25_sitelink'];
    }

    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('account_ids')
      .eq('user_id', user.id)
      .in('portfolio_type', portfolioTypes);

    const allAccountIds = new Set<string>();
    portfolios?.forEach(p => p.account_ids.forEach((id: string) => allAccountIds.add(id)));
    const accountIds = Array.from(allAccountIds);

    const { data: accountJiraLinks } = await supabase
      .from('account_jira_links')
      .select(`
        account_id,
        match_type,
        jira_issues!inner(
          id,
          status,
          issue_type,
          resolution,
          resolution_date,
          updated_date
        )
      `)
      .in('account_id', accountIds)
      .eq('user_id', user.id)
      .in('match_type', ['salesforce_case', 'client_field']);

    const accountTicketCounts: Record<string, { resolved_120d: number; in_progress: number; open: number }> = {};

    // Initialize all accounts with zero counts
    accountIds.forEach(accountId => {
      accountTicketCounts[accountId] = { resolved_120d: 0, in_progress: 0, open: 0 };
    });

    // Group links by account and deduplicate tickets by ID
    const accountTickets: Record<string, Map<string, any>> = {};
    accountJiraLinks?.forEach((link: any) => {
      const accountId = link.account_id;
      const ticket = link.jira_issues;

      // Skip ops issue types
      if (OPS_ISSUE_TYPES.includes(ticket.issue_type)) return;

      if (!accountTickets[accountId]) {
        accountTickets[accountId] = new Map();
      }

      // Deduplicate by ticket ID - only count each unique ticket once
      if (!accountTickets[accountId].has(ticket.id)) {
        accountTickets[accountId].set(ticket.id, ticket);
      }
    });

    // Count deduplicated tickets per account
    Object.entries(accountTickets).forEach(([accountId, ticketsMap]) => {
      ticketsMap.forEach((ticket) => {
        const statusLower = ticket.status?.toLowerCase() || '';
        const resolutionLower = ticket.resolution?.toLowerCase() || '';
        const isResolved =
          statusLower === 'closed' &&
          (resolutionLower === 'done' || resolutionLower === 'duplicate' || resolutionLower === 'cannot reproduce');

        if (isResolved && ticket.resolution_date) {
          const resolvedDate = new Date(ticket.resolution_date);
          if (resolvedDate >= oneHundredTwentyDaysAgo) {
            accountTicketCounts[accountId].resolved_120d++;
          }
        } else if (!isResolved && IN_PROGRESS_STATUSES.some((s: string) => statusLower.includes(s))) {
          accountTicketCounts[accountId].in_progress++;
        } else if (!isResolved) {
          accountTicketCounts[accountId].open++;
        }
      });
    });

    return NextResponse.json({
      portfolio: {
        resolved_60d,
        resolved_120d,
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
