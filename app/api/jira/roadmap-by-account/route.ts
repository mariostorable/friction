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

    // Get all active accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    const accountIds = accounts.map(a => a.id);

    // Get all Jira issues linked to these accounts via account_jira_links
    const { data: accountJiraLinks } = await supabase
      .from('account_jira_links')
      .select(`
        account_id,
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
      .in('account_id', accountIds)
      .eq('user_id', user.id);

    if (!accountJiraLinks || accountJiraLinks.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Get theme associations for display purposes
    const jiraIssueIds = new Set(accountJiraLinks.map((link: any) => link.jira_issues.id));
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

    // Initialize accounts
    accounts.forEach(account => {
      accountIssues[account.id] = {
        account,
        issues: []
      };
    });

    // Add issues to accounts
    accountJiraLinks.forEach((link: any) => {
      const issue = link.jira_issues;
      const themes = issueThemes.get(issue.id) || [];

      accountIssues[link.account_id]?.issues.push({
        ...issue,
        theme_keys: themes,
        theme_key: themes[0] || 'general' // Primary theme for compatibility
      });
    });

    // Categorize issues and calculate counts for each account
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const accountSummaries = Object.values(accountIssues)
      .filter(entry => entry.issues.length > 0) // Only accounts with issues
      .map(entry => {
        const resolved: any[] = [];
        const in_progress: any[] = [];
        const open: any[] = [];

        entry.issues.forEach(issue => {
          if (issue.resolution_date) {
            const resolvedDate = new Date(issue.resolution_date);
            if (resolvedDate >= fourteenDaysAgo) {
              resolved.push(issue);
            }
          } else {
            const statusLower = issue.status?.toLowerCase() || '';
            if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
              in_progress.push(issue);
            } else {
              open.push(issue);
            }
          }
        });

        return {
          account_id: entry.account.id,
          account_name: entry.account.name,
          total_issues: entry.issues.length,
          resolved_count: resolved.length,
          in_progress_count: in_progress.length,
          open_count: open.length,
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
