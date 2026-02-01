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

    // Get all Jira tickets linked to themes
    const { data: themeLinks } = await supabase
      .from('theme_jira_links')
      .select(`
        theme_key,
        jira_issues!inner(
          id,
          status,
          resolution_date
        )
      `)
      .eq('jira_issues.user_id', user.id);

    // Aggregate counts by theme
    const themeCounts: Record<string, {
      resolved: number;
      in_progress: number;
      open: number;
      total: number;
    }> = {};

    themeLinks?.forEach((link: any) => {
      const themeKey = link.theme_key;
      const ticket = link.jira_issues;

      if (!themeCounts[themeKey]) {
        themeCounts[themeKey] = { resolved: 0, in_progress: 0, open: 0, total: 0 };
      }

      themeCounts[themeKey].total++;

      if (ticket.resolution_date) {
        themeCounts[themeKey].resolved++;
      } else {
        const statusLower = ticket.status?.toLowerCase() || '';
        if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
          themeCounts[themeKey].in_progress++;
        } else {
          themeCounts[themeKey].open++;
        }
      }
    });

    return NextResponse.json({ themeCounts });

  } catch (error) {
    console.error('Error fetching theme ticket counts:', error);
    return NextResponse.json({
      error: 'Failed to fetch ticket counts',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
