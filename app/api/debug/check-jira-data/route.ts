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

    // Check Jira issues
    const { data: jiraIssues, count: jiraCount } = await supabase
      .from('jira_issues')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    // Check theme_jira_links
    const { data: themeLinks, count: linkCount } = await supabase
      .from('theme_jira_links')
      .select('*', { count: 'exact' });

    // Check Jira integration status
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'jira')
      .single();

    return NextResponse.json({
      jiraIssues: {
        total: jiraCount || 0,
        sample: jiraIssues?.slice(0, 3).map(j => ({
          key: j.key,
          summary: j.summary,
          status: j.status
        }))
      },
      themeLinks: {
        total: linkCount || 0,
        sample: themeLinks?.slice(0, 5)
      },
      jiraIntegration: {
        connected: !!integration,
        status: integration?.status,
        lastSynced: integration?.last_synced_at
      },
      diagnosis: jiraCount === 0 ? 'No Jira issues found - need to sync Jira' :
                 linkCount === 0 ? 'Jira issues exist but no theme links - run Jira sync' :
                 'Data exists - check dashboard query'
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
