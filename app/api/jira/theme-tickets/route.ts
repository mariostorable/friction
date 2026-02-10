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

    const searchParams = request.nextUrl.searchParams;
    const themeKey = searchParams.get('theme');

    if (!themeKey) {
      return NextResponse.json({ error: 'Theme key required' }, { status: 400 });
    }

    // Get Jira issues linked to this theme
    const { data: jiraLinks } = await supabase
      .from('theme_jira_links')
      .select(`
        theme_key,
        match_confidence,
        jira_issues!inner(
          jira_key,
          summary,
          status,
          priority,
          issue_url,
          resolution_date,
          metadata,
          updated_date
        )
      `)
      .eq('theme_key', themeKey)
      .eq('jira_issues.user_id', user.id)
      .order('match_confidence', { ascending: false });

    const tickets = jiraLinks?.map((link: any) => ({
      jira_key: link.jira_issues.jira_key,
      summary: link.jira_issues.summary,
      status: link.jira_issues.status,
      priority: link.jira_issues.priority,
      issue_url: link.jira_issues.issue_url,
      resolution_date: link.jira_issues.resolution_date,
      release_date: link.jira_issues.metadata?.fixVersions?.[0]?.releaseDate ||
                    link.jira_issues.metadata?.['Release Date'] ||
                    link.jira_issues.metadata?.releaseDate ||
                    null,
      updated_date: link.jira_issues.updated_date,
      match_confidence: link.match_confidence
    })) || [];

    return NextResponse.json({ tickets });

  } catch (error) {
    console.error('Error fetching theme tickets:', error);
    return NextResponse.json({
      error: 'Failed to fetch theme tickets',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
