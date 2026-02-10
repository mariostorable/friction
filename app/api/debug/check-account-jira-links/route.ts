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

    // Check account_jira_links
    const { data: links, count: linkCount, error } = await supabase
      .from('account_jira_links')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .limit(5);

    return NextResponse.json({
      accountJiraLinks: {
        total: linkCount || 0,
        error: error?.message,
        sample: links
      },
      message: linkCount === 0 ?
        'No account-jira links found. Run Jira Sync to match tickets to accounts.' :
        `Found ${linkCount} account-jira links`
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
