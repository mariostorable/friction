import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get unique theme keys from friction cards
    const { data: frictionCards } = await supabase
      .from('friction_cards')
      .select('theme_key')
      .eq('user_id', user.id);

    const uniqueThemes = Array.from(new Set(frictionCards?.map(c => c.theme_key) || []));

    // Get Jira issues
    const { data: jiraIssues, count: jiraCount } = await supabase
      .from('jira_issues')
      .select('jira_key, summary, labels', { count: 'exact' })
      .eq('user_id', user.id)
      .limit(10);

    // Get theme-jira links
    const { data: themeLinks, count: linksCount } = await supabase
      .from('theme_jira_links')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    return NextResponse.json({
      friction_themes: uniqueThemes,
      friction_themes_count: uniqueThemes.length,
      jira_issues_count: jiraCount,
      jira_sample: jiraIssues,
      theme_links_count: linksCount,
      theme_links_sample: themeLinks?.slice(0, 10),
    });

  } catch (error) {
    console.error('Check themes error:', error);
    return NextResponse.json({
      error: 'Failed to check themes',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
