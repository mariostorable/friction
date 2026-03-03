import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // First authenticate the user
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Parse query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const accountIdsParam = searchParams.get('accountIds');
    const portfolioFilter = searchParams.get('portfolio') || 'all';
    const productFilter = searchParams.get('product') || 'all';
    const statusFilter = searchParams.get('status') || 'all';
    const priorityFilter = searchParams.get('priority') || 'all';
    const dateRangeDays = parseInt(searchParams.get('dateRangeDays') || '30');

    // Calculate date threshold for resolved issues
    const now = new Date();
    const dateThreshold = new Date(now.getTime() - dateRangeDays * 24 * 60 * 60 * 1000);

    // Use service role client for queries that need to bypass RLS for joins
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get portfolio accounts (Top 25 lists) - filtered by portfolio type
    let portfolioQuery = supabase
      .from('portfolios')
      .select('account_ids')
      .eq('user_id', user.id);

    if (portfolioFilter !== 'all') {
      portfolioQuery = portfolioQuery.eq('portfolio_type', portfolioFilter);
    } else {
      portfolioQuery = portfolioQuery.in('portfolio_type', ['top_25_edge', 'top_25_marine', 'top_25_sitelink']);
    }

    const { data: portfolios } = await portfolioQuery;

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Collect unique account IDs from all portfolios
    const portfolioAccountIds = new Set<string>();
    portfolios.forEach(p => p.account_ids.forEach((id: string) => portfolioAccountIds.add(id)));

    let accountIds = Array.from(portfolioAccountIds);

    // If specific accounts selected, use those instead of portfolio accounts
    if (accountIdsParam) {
      const selectedIds = accountIdsParam.split(',').filter(id => id.length > 0);
      if (selectedIds.length > 0) {
        accountIds = selectedIds;
      }
    }

    if (accountIds.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Get account details with products field for filtering
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, products')
      .in('id', accountIds)
      .eq('status', 'active');

    // Filter accounts by product if specified
    let filteredAccounts = accounts;
    if (productFilter !== 'all' && accounts) {
      filteredAccounts = accounts.filter(account => {
        const products = (account.products || '').toLowerCase();
        if (productFilter === 'edge') return products.includes('edge');
        if (productFilter === 'sitelink') return products.includes('sitelink');
        if (productFilter === 'other') return !products.includes('edge') && !products.includes('sitelink');
        return true;
      });
    }

    if (!filteredAccounts || filteredAccounts.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Extract account IDs from filtered accounts
    const filteredAccountIds = filteredAccounts.map(a => a.id);

    // Parse showOpsTickets param (default false - hide Operational Work / Data Fix / Vendor)
    const showOpsTickets = searchParams.get('showOpsTickets') === 'true';

    // Internal/ops issue types excluded from CS-facing roadmap by default
    const OPS_ISSUE_TYPES = ['Operational Work', 'Data Fix', 'Vendor'];

    // Get all Jira issues linked to these accounts via account_jira_links
    // Only valid link strategies: salesforce_case and client_field
    const { data: accountJiraLinks } = await supabase
      .from('account_jira_links')
      .select(`
        account_id,
        match_type,
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
      .in('account_id', filteredAccountIds)
      .eq('user_id', user.id)
      .in('match_type', ['salesforce_case', 'client_field']);

    // Filter tickets by project type:
    // - When viewing marine portfolio: only show marine project tickets
    // - When viewing storage portfolios (or all): exclude marine project tickets
    const marineProjects = ['NBK', 'MREQ', 'MDEV', 'EASY', 'TOPS', 'BZD', 'ESST'];
    const isMarine = portfolioFilter === 'top_25_marine';
    const filteredLinks = accountJiraLinks?.filter((link: any) => {
      const issue = link.jira_issues;
      const projectCode = issue.jira_key.split('-')[0].toUpperCase();
      const isMarineTicket = marineProjects.includes(projectCode);
      if (isMarine && !isMarineTicket) return false;  // marine view: only marine tickets
      if (!isMarine && isMarineTicket) return false;   // storage view: exclude marine tickets
      if (!showOpsTickets && OPS_ISSUE_TYPES.includes(issue.issue_type)) return false;
      return true;
    }) || [];

    if (!filteredLinks || filteredLinks.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Get theme associations for display purposes
    const jiraIssueIds = new Set(filteredLinks.map((link: any) => link.jira_issues.id));
    const { data: themeLinks } = await supabase
      .from('theme_jira_links')
      .select('jira_issue_id, theme_key')
      .in('jira_issue_id', Array.from(jiraIssueIds))
      .eq('user_id', user.id);

    // Build issue -> themes mapping
    const issueThemes = new Map<string, string[]>();
    themeLinks?.forEach((link: any) => {
      if (!issueThemes.has(link.jira_issue_id)) {
        issueThemes.set(link.jira_issue_id, []);
      }
      issueThemes.get(link.jira_issue_id)!.push(link.theme_key);
    });

    // Build account -> issues mapping from account_jira_links
    const accountIssues: Record<string, {
      account: any;
      issues: any[];
    }> = {};

    // Initialize accounts (use filtered accounts)
    filteredAccounts.forEach(account => {
      accountIssues[account.id] = {
        account,
        issues: []
      };
    });

    // Add issues to accounts
    filteredLinks.forEach((link: any) => {
      const issue = link.jira_issues;
      const themes = issueThemes.get(issue.id) || [];

      accountIssues[link.account_id]?.issues.push({
        ...issue,
        theme_keys: themes,
        theme_key: themes[0] || 'general' // Primary theme for compatibility
      });
    });

    // Categorize issues and calculate counts for each account
    const accountSummaries = Object.values(accountIssues)
      .filter(entry => entry.issues.length > 0) // Only accounts with issues
      .map(entry => {
        const resolved: any[] = [];
        const in_progress: any[] = [];
        const open: any[] = [];

        entry.issues.forEach(issue => {
          // Apply priority filter
          const priorityLower = issue.priority?.toLowerCase() || '';
          const matchesPriority = priorityFilter === 'all' ||
            (priorityFilter === 'highest' && (priorityLower.includes('highest') || priorityLower.includes('critical'))) ||
            (priorityFilter === 'high' && priorityLower.includes('high') && !priorityLower.includes('highest')) ||
            (priorityFilter === 'medium' && priorityLower.includes('medium')) ||
            (priorityFilter === 'low' && priorityLower.includes('low'));

          if (!matchesPriority) return; // Skip if doesn't match priority filter

          // Status categorization per spec:
          // Resolved: status Closed AND resolution in (Done, Duplicate, Cannot Reproduce)
          // In Progress: In Progress, Dev Testing, Deployed to Staging, Selected for Deployment,
          //              Staging Testing, In Product Refinement, Requirements Review
          // On Radar: Backlog, Product Backlog, New, To Do (and anything else open)
          const statusLower = issue.status?.toLowerCase() || '';
          const resolutionLower = issue.resolution?.toLowerCase() || '';

          const isResolved =
            statusLower === 'closed' &&
            (resolutionLower === 'done' || resolutionLower === 'duplicate' || resolutionLower === 'cannot reproduce');

          const IN_PROGRESS_STATUSES = [
            'in progress', 'dev testing', 'deployed to staging',
            'selected for deployment', 'staging testing',
            'in product refinement', 'requirements review'
          ];
          const isInProgress = IN_PROGRESS_STATUSES.some(s => statusLower.includes(s));

          if (isResolved && issue.resolution_date) {
            const resolvedDate = new Date(issue.resolution_date);
            if (resolvedDate >= dateThreshold) {
              // Apply optional status sub-filter
              if (statusFilter === 'all') {
                resolved.push(issue);
              } else if (statusFilter === 'resolved') {
                resolved.push(issue);
              } else if (statusFilter === 'closed') {
                resolved.push(issue);
              }
            }
          } else if (isInProgress) {
            in_progress.push(issue);
          } else if (!isResolved) {
            // On Radar: Backlog, New, To Do, etc.
            open.push(issue);
          }
        });

        // Calculate "new this week" - tickets updated in last 7 days
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const resolved_new = resolved.filter(issue => {
          const updatedDate = new Date(issue.updated_date || issue.resolution_date);
          return updatedDate >= sevenDaysAgo;
        });
        const in_progress_new = in_progress.filter(issue => {
          const updatedDate = new Date(issue.updated_date);
          return updatedDate >= sevenDaysAgo;
        });
        const open_new = open.filter(issue => {
          const updatedDate = new Date(issue.updated_date);
          return updatedDate >= sevenDaysAgo;
        });

        return {
          account_id: entry.account.id,
          account_name: entry.account.name,
          total_issues: entry.issues.length,
          resolved_count: resolved.length,
          in_progress_count: in_progress.length,
          open_count: open.length,
          resolved_new_count: resolved_new.length,
          in_progress_new_count: in_progress_new.length,
          open_new_count: open_new.length,
          resolved,
          in_progress,
          open
        };
      })
      .sort((a, b) => b.total_issues - a.total_issues); // Sort by total issues descending

    return NextResponse.json({
      accounts: accountSummaries,
      total_accounts: accountSummaries.length
    });

  } catch (error) {
    console.error('Error fetching roadmap by account:', error);
    return NextResponse.json({
      error: 'Failed to fetch roadmap by account',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
