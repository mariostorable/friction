import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const accountId = params.id;

    // 1. Get friction themes for this account (weighted by case volume and severity)
    const { data: accountThemes } = await supabase
      .from('friction_cards')
      .select('theme_key, severity')
      .eq('account_id', accountId);

    if (!accountThemes || accountThemes.length === 0) {
      return NextResponse.json({
        recentlyResolved: [],
        onRadar: [],
        shouldPrioritize: [],
        comingSoon: [],
        themeStats: {}
      });
    }

    // Calculate theme weights (case count × avg severity)
    const themeWeights: Record<string, { count: number; avgSeverity: number; weight: number }> = {};
    accountThemes.forEach((item: any) => {
      const theme = item.theme_key;
      if (!themeWeights[theme]) {
        themeWeights[theme] = { count: 0, avgSeverity: 0, weight: 0 };
      }
      themeWeights[theme].count++;
      themeWeights[theme].avgSeverity += item.severity || 3;
    });

    Object.keys(themeWeights).forEach(theme => {
      const stats = themeWeights[theme];
      stats.avgSeverity = stats.avgSeverity / stats.count;
      stats.weight = stats.count * stats.avgSeverity;
    });

    const accountThemeKeys = Object.keys(themeWeights);

    // Internal/ops issue types excluded from CS-facing views
    const OPS_ISSUE_TYPES = ['Operational Work', 'Data Fix', 'Vendor'];

    // 2. Get all Jira issues linked to this account via account_jira_links table
    // Only valid strategies: salesforce_case and client_field
    const { data: accountJiraLinks } = await supabase
      .from('account_jira_links')
      .select(`
        match_type,
        match_confidence,
        jira_issues!inner(
          id,
          jira_key,
          summary,
          description,
          status,
          issue_type,
          priority,
          resolution,
          assignee_name,
          resolution_date,
          updated_date,
          issue_url,
          labels,
          ai_summary
        )
      `)
      .eq('account_id', accountId)
      .eq('jira_issues.user_id', user.id)
      .in('match_type', ['salesforce_case', 'client_field']);

    if (!accountJiraLinks || accountJiraLinks.length === 0) {
      // No tickets yet - all themes should be prioritized
      const shouldPrioritize = accountThemeKeys
        .map(theme => ({
          theme_key: theme,
          case_count: themeWeights[theme].count,
          avg_severity: themeWeights[theme].avgSeverity,
          weight: themeWeights[theme].weight,
          hasTicket: false
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5);

      return NextResponse.json({
        recentlyResolved: [],
        onRadar: [],
        shouldPrioritize,
        comingSoon: [],
        summary: {
          resolved_60d: 0,
          resolved_120d: 0,
          open_count: 0,
          in_progress: 0,
          needs_ticket: shouldPrioritize.length
        },
        themeStats: themeWeights
      });
    }

    // Get theme links for these Jira issues (for display purposes)
    const jiraIssueIds = accountJiraLinks.map((link: any) => link.jira_issues.id);
    const { data: themeLinks } = await supabase
      .from('theme_jira_links')
      .select('jira_issue_id, theme_key')
      .in('jira_issue_id', jiraIssueIds)
      .eq('user_id', user.id);

    // Build issue ID -> themes mapping
    const issueThemes = new Map<string, string[]>();
    themeLinks?.forEach((link: any) => {
      if (!issueThemes.has(link.jira_issue_id)) {
        issueThemes.set(link.jira_issue_id, []);
      }
      issueThemes.get(link.jira_issue_id)!.push(link.theme_key);
    });

    // Transform to include theme info, filtering out ops issue types
    const jiraIssues = accountJiraLinks
      .filter((link: any) => !OPS_ISSUE_TYPES.includes(link.jira_issues.issue_type))
      .map((link: any) => {
        const issue = link.jira_issues;
        const themes = issueThemes.get(issue.id) || [];
        return {
          ...link,
          theme_key: themes[0] || 'general',
          all_themes: themes,
          is_account_specific: link.match_type === 'salesforce_case' || link.match_type === 'client_field'
        };
      });

    // 3. Categorize issues
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const oneHundredTwentyDaysAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

    const recentlyResolved: any[] = [];
    const onRadar: any[] = [];
    const comingSoon: any[] = [];
    const themesWithTickets = new Set<string>();

    jiraIssues.forEach((link: any) => {
      const issue = link.jira_issues;
      const themeKey = link.theme_key;
      themesWithTickets.add(themeKey);

      const issueData = {
        ...issue,
        theme_key: themeKey,
        theme_weight: themeWeights[themeKey]?.weight || 0,
        case_count: themeWeights[themeKey]?.count || 0,
        match_confidence: link.match_confidence
      };

      const statusLower = issue.status?.toLowerCase() || '';
      const resolutionLower = issue.resolution?.toLowerCase() || '';

      // Resolved: status=Closed AND resolution in (Done, Duplicate, Cannot Reproduce)
      const isResolved =
        statusLower === 'closed' &&
        (resolutionLower === 'done' || resolutionLower === 'duplicate' || resolutionLower === 'cannot reproduce');

      // In Progress (Coming Soon): active development statuses
      const IN_PROGRESS_STATUSES = [
        'in progress', 'dev testing', 'deployed to staging',
        'selected for deployment', 'staging testing',
        'in product refinement', 'requirements review'
      ];
      const isInProgress = IN_PROGRESS_STATUSES.some(s => statusLower.includes(s));

      if (isResolved && issue.resolution_date) {
        const resolvedDate = new Date(issue.resolution_date);
        issueData.resolved_days_ago = Math.floor((now.getTime() - resolvedDate.getTime()) / (24 * 60 * 60 * 1000));

        if (resolvedDate >= thirtyDaysAgo) {
          issueData.time_period = '30d';
          recentlyResolved.push(issueData);
        } else if (resolvedDate >= sixtyDaysAgo) {
          issueData.time_period = '60d';
          recentlyResolved.push(issueData);
        } else if (resolvedDate >= oneHundredTwentyDaysAgo) {
          issueData.time_period = '120d';
          recentlyResolved.push(issueData);
        }
      } else if (isInProgress) {
        comingSoon.push(issueData);
      } else if (!isResolved) {
        // On Radar: Backlog, New, To Do, etc.
        onRadar.push(issueData);
      }
    });

    // 4. Find themes that should be prioritized (high weight but no ticket)
    const themesWithoutTickets = accountThemeKeys
      .filter(theme => !themesWithTickets.has(theme))
      .map(theme => ({
        theme_key: theme,
        case_count: themeWeights[theme].count,
        avg_severity: themeWeights[theme].avgSeverity,
        weight: themeWeights[theme].weight,
        hasTicket: false
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    // Also check if any on-radar tickets are shared with other top accounts
    // This would require querying other accounts' themes - simplified for now
    const shouldPrioritize = [...themesWithoutTickets];

    // 5. Sort results by relevance
    recentlyResolved.sort((a, b) => {
      // First by time period, then by theme weight
      if (a.time_period !== b.time_period) {
        const order = { '30d': 0, '60d': 1, '120d': 2 };
        return order[a.time_period as keyof typeof order] - order[b.time_period as keyof typeof order];
      }
      return b.theme_weight - a.theme_weight;
    });

    onRadar.sort((a, b) => b.theme_weight - a.theme_weight);
    comingSoon.sort((a, b) => b.theme_weight - a.theme_weight);

    return NextResponse.json({
      recentlyResolved: recentlyResolved.slice(0, 10),
      onRadar: onRadar.slice(0, 10),
      shouldPrioritize,
      comingSoon: comingSoon.slice(0, 10),
      themeStats: themeWeights,
      summary: {
        resolved_60d: recentlyResolved.filter(i => i.time_period === '30d' || i.time_period === '60d').length,
        resolved_120d: recentlyResolved.length,
        open_count: onRadar.length + comingSoon.length,
        in_progress: comingSoon.length,
        needs_ticket: themesWithoutTickets.length
      }
    });

  } catch (error) {
    console.error('Error fetching Jira status:', error);
    return NextResponse.json({
      error: 'Failed to fetch Jira status',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
