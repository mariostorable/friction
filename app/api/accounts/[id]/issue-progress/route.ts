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

    // Get all REAL friction cards for this account (exclude normal support)
    const { data: frictionCards } = await supabase
      .from('friction_cards')
      .select('id, theme_key, severity, created_at')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .eq('is_friction', true); // Only count real friction, not normal support

    if (!frictionCards || frictionCards.length === 0) {
      return NextResponse.json({
        total_issues: 0,
        fixed: 0,
        in_progress: 0,
        open: 0,
        fix_rate_30d: 0
      });
    }

    const total_issues = frictionCards.length;

    // Get unique theme keys for counting issues without tickets
    const themeKeys = Array.from(new Set(frictionCards.map(c => c.theme_key)));

    // Get Jira tickets linked to this account via account_jira_links
    const { data: accountJiraLinks } = await supabase
      .from('account_jira_links')
      .select(`
        jira_issues!inner(
          id,
          status,
          resolution_date
        )
      `)
      .eq('account_id', accountId)
      .eq('user_id', user.id);

    // Get theme associations for these tickets (for display purposes)
    const jiraIssueIds = accountJiraLinks?.map((link: any) => link.jira_issues.id) || [];
    const { data: themeLinks } = await supabase
      .from('theme_jira_links')
      .select('jira_issue_id, theme_key')
      .in('jira_issue_id', jiraIssueIds)
      .eq('user_id', user.id);

    // Build ticket -> themes mapping
    const ticketThemes = new Map<string, Set<string>>();
    themeLinks?.forEach((link: any) => {
      if (!ticketThemes.has(link.jira_issue_id)) {
        ticketThemes.set(link.jira_issue_id, new Set());
      }
      ticketThemes.get(link.jira_issue_id)!.add(link.theme_key);
    });

    // Count ticket statuses
    let fixed = 0;
    let in_progress = 0;
    let open = 0;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let fix_rate_30d = 0;

    const themesWithTickets = new Set<string>();

    accountJiraLinks?.forEach((link: any) => {
      const ticket = link.jira_issues;

      // Track which themes have tickets
      const themes = ticketThemes.get(ticket.id) || new Set();
      themes.forEach(theme => themesWithTickets.add(theme));

      if (ticket.resolution_date) {
        fixed++;
        const resolvedDate = new Date(ticket.resolution_date);
        if (resolvedDate >= thirtyDaysAgo) {
          fix_rate_30d++;
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

    // Count themes with no Jira tickets as open
    const themesWithoutTickets = themeKeys.filter(key => !themesWithTickets.has(key));
    open += themesWithoutTickets.length;

    return NextResponse.json({
      total_issues,
      fixed,
      in_progress,
      open,
      fix_rate_30d
    });

  } catch (error) {
    console.error('Error fetching issue progress:', error);
    return NextResponse.json({
      error: 'Failed to fetch issue progress',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
