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

    // Get all friction cards with theme and account info
    const { data: frictionCards } = await supabase
      .from('friction_cards')
      .select(`
        theme_key,
        account_id,
        accounts (
          id,
          name,
          status
        )
      `)
      .eq('user_id', user.id)
      .eq('accounts.status', 'active');

    if (!frictionCards || frictionCards.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Get all theme links with their Jira issues
    const actualThemeKeys = Array.from(new Set(frictionCards.map(c => c.theme_key)));

    const { data: themeLinks } = await supabase
      .from('theme_jira_links')
      .select(`
        theme_key,
        jira_issue:jira_issues!inner (
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
      .eq('user_id', user.id)
      .in('theme_key', actualThemeKeys);

    // Build account -> issues mapping
    const accountIssues: Record<string, {
      account: any;
      issues: any[];
    }> = {};

    // Map themes to accounts
    const themeToAccounts: Record<string, Set<string>> = {};
    frictionCards.forEach((card: any) => {
      if (!themeToAccounts[card.theme_key]) {
        themeToAccounts[card.theme_key] = new Set();
      }
      themeToAccounts[card.theme_key].add(card.account_id);

      // Initialize account entry
      if (!accountIssues[card.account_id]) {
        accountIssues[card.account_id] = {
          account: card.accounts,
          issues: []
        };
      }
    });

    // Add issues to accounts based on theme links
    const addedIssues = new Set<string>(); // Track unique issue-account pairs
    themeLinks?.forEach((link: any) => {
      const accountIds = themeToAccounts[link.theme_key];
      if (accountIds) {
        accountIds.forEach(accountId => {
          const issueKey = `${accountId}-${link.jira_issue.id}`;
          if (!addedIssues.has(issueKey)) {
            accountIssues[accountId]?.issues.push({
              ...link.jira_issue,
              theme_key: link.theme_key
            });
            addedIssues.add(issueKey);
          }
        });
      }
    });

    // Categorize issues and calculate counts for each account
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const accountSummaries = Object.values(accountIssues)
      .filter(entry => entry.issues.length > 0) // Only accounts with issues
      .map(entry => {
        const resolved: any[] = [];
        const in_progress: any[] = [];
        const open: any[] = [];

        entry.issues.forEach(issue => {
          if (issue.resolution_date) {
            const resolvedDate = new Date(issue.resolution_date);
            if (resolvedDate >= sevenDaysAgo) {
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
