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

    // Get all friction cards for this account
    const { data: frictionCards } = await supabase
      .from('friction_cards')
      .select('id, theme_key, severity, created_at')
      .eq('account_id', accountId)
      .eq('user_id', user.id);

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

    // Get unique theme keys
    const themeKeys = Array.from(new Set(frictionCards.map(c => c.theme_key)));

    // Get Jira tickets linked to these themes
    const { data: jiraLinks } = await supabase
      .from('theme_jira_links')
      .select(`
        theme_key,
        jira_issues!inner(
          status,
          resolution_date
        )
      `)
      .in('theme_key', themeKeys)
      .eq('jira_issues.user_id', user.id);

    // Count ticket statuses
    let fixed = 0;
    let in_progress = 0;
    let open = 0;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let fix_rate_30d = 0;

    const ticketsByTheme: Record<string, any[]> = {};

    jiraLinks?.forEach((link: any) => {
      const ticket = link.jira_issues;
      const themeKey = link.theme_key;

      if (!ticketsByTheme[themeKey]) {
        ticketsByTheme[themeKey] = [];
      }
      ticketsByTheme[themeKey].push(ticket);

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
    const themesWithTickets = new Set(Object.keys(ticketsByTheme));
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
