import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check jira_issues
    const { data: issues, error: issuesError } = await supabaseAdmin
      .from('jira_issues')
      .select('id, jira_key, jira_id, summary')
      .eq('user_id', user.id)
      .limit(5);

    // Check theme_jira_links
    const { data: themeLinks, error: themeLinksError } = await supabaseAdmin
      .from('theme_jira_links')
      .select('*')
      .eq('user_id', user.id)
      .limit(10);

    // Try the join that's failing
    const { data: joinedData, error: joinError } = await supabaseAdmin
      .from('theme_jira_links')
      .select(`
        theme_key,
        jira_key,
        jira_issue_id,
        confidence,
        match_type,
        jira_issue:jira_issues!inner(
          id,
          jira_key,
          summary,
          status
        )
      `)
      .eq('user_id', user.id)
      .limit(5);

    // Count records
    const { count: issuesCount } = await supabaseAdmin
      .from('jira_issues')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: linksCount } = await supabaseAdmin
      .from('theme_jira_links')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Check if IDs match
    const idMismatch: any[] = [];
    if (themeLinks && issues) {
      themeLinks.forEach((link: any) => {
        const matchingIssue = issues.find((issue: any) => issue.id === link.jira_issue_id);
        if (!matchingIssue) {
          idMismatch.push({
            link_jira_key: link.jira_key,
            link_jira_issue_id: link.jira_issue_id,
            available_issue_ids: issues.map((i: any) => ({ id: i.id, jira_key: i.jira_key }))
          });
        }
      });
    }

    return NextResponse.json({
      summary: {
        total_issues: issuesCount,
        total_theme_links: linksCount,
        sample_issues_fetched: issues?.length || 0,
        sample_links_fetched: themeLinks?.length || 0,
        joined_results: joinedData?.length || 0,
      },
      sample_issues: issues,
      sample_theme_links: themeLinks,
      joined_data: joinedData,
      join_error: joinError,
      id_mismatches: idMismatch,
      diagnosis: idMismatch.length > 0
        ? `PROBLEM: ${idMismatch.length} theme links have jira_issue_id that don't match any jira_issues.id`
        : joinError
        ? `JOIN ERROR: ${joinError.message}`
        : joinedData && joinedData.length === 0 && linksCount && linksCount > 0
        ? 'Links exist but join returns nothing - possible FK issue'
        : 'Everything looks OK',
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      error: 'Debug failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
