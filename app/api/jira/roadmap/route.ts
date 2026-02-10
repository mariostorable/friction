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

    // Get all Jira issues with their linked themes and accounts
    const { data: jiraIssues, error: issuesError } = await supabase
      .from('jira_issues')
      .select(`
        id,
        jira_key,
        summary,
        ai_summary,
        status,
        priority,
        resolution_date,
        updated_date,
        issue_url
      `)
      .eq('user_id', user.id)
      .order('updated_date', { ascending: false });

    if (issuesError) {
      console.error('Error fetching Jira issues:', issuesError);
      return NextResponse.json({ error: 'Failed to fetch Jira issues' }, { status: 500 });
    }

    if (!jiraIssues || jiraIssues.length === 0) {
      return NextResponse.json({
        resolved: [],
        in_progress: [],
        open: []
      });
    }

    // Get all friction cards first to discover actual themes
    const { data: frictionCards } = await supabase
      .from('friction_cards')
      .select('theme_key, account_id, accounts(name)')
      .eq('user_id', user.id);

    // Extract actual theme keys that exist in the system
    const actualThemeKeys = Array.from(new Set(frictionCards?.map(c => c.theme_key) || []));

    // Get theme links ONLY for themes that actually exist in friction_cards
    const { data: themeLinks } = await supabase
      .from('theme_jira_links')
      .select('jira_issue_id, theme_key')
      .eq('user_id', user.id)
      .in('theme_key', actualThemeKeys);

    // Build theme mapping: jira_issue_id -> theme_keys[]
    const issueThemes: Record<string, string[]> = {};
    themeLinks?.forEach(link => {
      if (!issueThemes[link.jira_issue_id]) {
        issueThemes[link.jira_issue_id] = [];
      }
      issueThemes[link.jira_issue_id].push(link.theme_key);
    });

    // Build theme -> accounts mapping
    const themeAccounts: Record<string, Set<string>> = {};
    const accountNames: Record<string, string> = {};

    frictionCards?.forEach((card: any) => {
      if (!themeAccounts[card.theme_key]) {
        themeAccounts[card.theme_key] = new Set();
      }
      themeAccounts[card.theme_key].add(card.account_id);
      if (card.accounts?.name) {
        accountNames[card.account_id] = card.accounts.name;
      }
    });

    // Categorize issues and enrich with theme/account data
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const resolved: any[] = [];
    const in_progress: any[] = [];
    const open: any[] = [];

    jiraIssues.forEach(issue => {
      const themeKeys = issueThemes[issue.id] || [];

      // Collect all unique accounts affected by this issue's themes
      const affectedAccounts = new Set<string>();
      themeKeys.forEach(theme => {
        const accounts = themeAccounts[theme] || new Set();
        accounts.forEach(accountId => affectedAccounts.add(accountId));
      });

      const affectedAccountNames = Array.from(affectedAccounts).map(id => accountNames[id] || 'Unknown');

      const enrichedIssue = {
        jira_key: issue.jira_key,
        summary: issue.summary,
        ai_summary: issue.ai_summary,
        status: issue.status,
        priority: issue.priority,
        resolution_date: issue.resolution_date,
        updated_date: issue.updated_date,
        issue_url: issue.issue_url,
        theme_keys: themeKeys,
        account_names: affectedAccountNames,
        affected_account_count: affectedAccounts.size
      };

      // Categorize by status
      if (issue.resolution_date) {
        const resolvedDate = new Date(issue.resolution_date);
        // Only include recently resolved (last 14 days) in resolved category
        if (resolvedDate >= fourteenDaysAgo) {
          resolved.push(enrichedIssue);
        }
      } else {
        const statusLower = issue.status?.toLowerCase() || '';
        if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
          in_progress.push(enrichedIssue);
        } else {
          open.push(enrichedIssue);
        }
      }
    });

    return NextResponse.json({
      resolved,
      in_progress,
      open
    });

  } catch (error) {
    console.error('Error fetching roadmap:', error);
    return NextResponse.json({
      error: 'Failed to fetch roadmap',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
