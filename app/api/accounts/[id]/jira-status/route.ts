import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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

    // 2a. Get Jira issues linked directly to this account by name
    const { data: accountJiraIssues } = await supabase
      .from('account_jira_links')
      .select(`
        match_confidence,
        jira_issues!inner(
          id,
          jira_key,
          summary,
          description,
          status,
          priority,
          assignee_name,
          resolution_date,
          updated_date,
          issue_url,
          labels,
          ai_summary
        )
      `)
      .eq('account_id', accountId)
      .eq('jira_issues.user_id', user.id);

    // 2b. Get all Jira issues linked to these themes
    const { data: themeJiraIssues } = await supabase
      .from('theme_jira_links')
      .select(`
        theme_key,
        match_confidence,
        jira_issues!inner(
          id,
          jira_key,
          summary,
          description,
          status,
          priority,
          assignee_name,
          resolution_date,
          updated_date,
          issue_url,
          labels,
          ai_summary
        )
      `)
      .in('theme_key', accountThemeKeys)
      .eq('jira_issues.user_id', user.id);

    // Combine both sources (prioritize direct account links)
    const accountIssuesMap = new Map();
    (accountJiraIssues || []).forEach((link: any) => {
      const issue = link.jira_issues;
      accountIssuesMap.set(issue.id, {
        ...link,
        theme_key: 'account_specific', // Special marker for account-specific tickets
        is_account_specific: true
      });
    });

    (themeJiraIssues || []).forEach((link: any) => {
      const issue = link.jira_issues;
      if (!accountIssuesMap.has(issue.id)) {
        accountIssuesMap.set(issue.id, { ...link, is_account_specific: false });
      }
    });

    const jiraIssues = Array.from(accountIssuesMap.values());

    if (!jiraIssues || jiraIssues.length === 0) {
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
        themeStats: themeWeights
      });
    }

    // 3. Categorize issues
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

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

      // Check if resolved
      if (issue.resolution_date) {
        const resolvedDate = new Date(issue.resolution_date);

        if (resolvedDate >= sevenDaysAgo) {
          issueData.resolved_days_ago = Math.floor((now.getTime() - resolvedDate.getTime()) / (24 * 60 * 60 * 1000));
          issueData.time_period = '7d';
          recentlyResolved.push(issueData);
        } else if (resolvedDate >= thirtyDaysAgo) {
          issueData.resolved_days_ago = Math.floor((now.getTime() - resolvedDate.getTime()) / (24 * 60 * 60 * 1000));
          issueData.time_period = '30d';
          recentlyResolved.push(issueData);
        } else if (resolvedDate >= ninetyDaysAgo) {
          issueData.resolved_days_ago = Math.floor((now.getTime() - resolvedDate.getTime()) / (24 * 60 * 60 * 1000));
          issueData.time_period = '90d';
          recentlyResolved.push(issueData);
        }
      } else {
        // Open ticket
        const statusLower = issue.status?.toLowerCase() || '';

        if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
          comingSoon.push(issueData);
        } else {
          onRadar.push(issueData);
        }
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
        const order = { '7d': 0, '30d': 1, '90d': 2 };
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
        resolved_7d: recentlyResolved.filter(i => i.time_period === '7d').length,
        resolved_30d: recentlyResolved.filter(i => i.time_period === '30d').length,
        resolved_90d: recentlyResolved.length,
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
