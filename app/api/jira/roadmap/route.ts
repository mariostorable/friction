import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use service role client for complex queries
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

    // Get portfolio accounts (storage only - exclude marine)
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('account_ids')
      .eq('user_id', user.id)
      .in('portfolio_type', ['top_25_edge', 'top_25_sitelink']); // Exclude top_25_marine

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({
        resolved: {},
        in_progress: {},
        open: {}
      });
    }

    // Collect unique account IDs from storage portfolios only
    const portfolioAccountIds = new Set<string>();
    portfolios.forEach(p => p.account_ids.forEach((id: string) => portfolioAccountIds.add(id)));
    const accountIds = Array.from(portfolioAccountIds);

    if (accountIds.length === 0) {
      return NextResponse.json({
        resolved: {},
        in_progress: {},
        open: {}
      });
    }

    // Get Jira issues ONLY linked to storage accounts
    const { data: accountJiraLinks, error: linksError } = await supabase
      .from('account_jira_links')
      .select(`
        jira_issue_id,
        jira_issues!inner(
          id,
          jira_key,
          summary,
          ai_summary,
          status,
          priority,
          resolution_date,
          updated_date,
          issue_url
        )
      `)
      .in('account_id', accountIds)
      .eq('user_id', user.id);

    if (linksError) {
      console.error('Error fetching Jira links:', linksError);
      return NextResponse.json({ error: 'Failed to fetch Jira issues' }, { status: 500 });
    }

    if (!accountJiraLinks || accountJiraLinks.length === 0) {
      return NextResponse.json({
        resolved: {},
        in_progress: {},
        open: {}
      });
    }

    // Extract unique Jira issues
    const issueMap = new Map();
    accountJiraLinks.forEach((link: any) => {
      const issue = link.jira_issues;
      if (!issueMap.has(issue.id)) {
        issueMap.set(issue.id, issue);
      }
    });

    const jiraIssues = Array.from(issueMap.values());

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

    // Group by theme and status
    const resolved: Record<string, any[]> = {};
    const in_progress: Record<string, any[]> = {};
    const open: Record<string, any[]> = {};

    jiraIssues.forEach(issue => {
      const themeKeys = issueThemes[issue.id] || [];

      // Skip issues with no themes (not linked to friction)
      if (themeKeys.length === 0) return;

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

      // Determine status category
      let targetCategory: Record<string, any[]>;
      if (issue.resolution_date) {
        const resolvedDate = new Date(issue.resolution_date);
        if (resolvedDate >= fourteenDaysAgo) {
          targetCategory = resolved;
        } else {
          return; // Skip old resolved issues
        }
      } else {
        const statusLower = issue.status?.toLowerCase() || '';
        if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
          targetCategory = in_progress;
        } else {
          targetCategory = open;
        }
      }

      // Add to each theme this issue belongs to
      themeKeys.forEach(theme => {
        if (!targetCategory[theme]) {
          targetCategory[theme] = [];
        }
        targetCategory[theme].push(enrichedIssue);
      });
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
