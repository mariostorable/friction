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

    // Check accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, name, status')
      .eq('user_id', user.id)
      .limit(10);

    // Check portfolios
    const { data: portfolios, error: portfoliosError } = await supabase
      .from('portfolios')
      .select('id, name, account_ids')
      .eq('user_id', user.id);

    // Check Jira issues
    const { data: jiraIssues, error: jiraError } = await supabase
      .from('jira_issues')
      .select('id, key, summary')
      .eq('user_id', user.id)
      .limit(10);

    // Check theme_jira_links
    const { data: themeLinks, error: themeLinksError } = await supabase
      .from('theme_jira_links')
      .select('theme_key, jira_issue_id')
      .limit(10);

    // Check OFI scores
    const { data: ofiScores, error: ofiError } = await supabase
      .from('ofi_scores')
      .select('account_id, ofi_score')
      .limit(10);

    return NextResponse.json({
      accounts: {
        count: accounts?.length || 0,
        error: accountsError?.message,
        sample: accounts?.slice(0, 3)
      },
      portfolios: {
        count: portfolios?.length || 0,
        error: portfoliosError?.message,
        names: portfolios?.map(p => p.name)
      },
      jiraIssues: {
        count: jiraIssues?.length || 0,
        error: jiraError?.message,
        sample: jiraIssues?.slice(0, 3)
      },
      themeLinks: {
        count: themeLinks?.length || 0,
        error: themeLinksError?.message
      },
      ofiScores: {
        count: ofiScores?.length || 0,
        error: ofiError?.message
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
