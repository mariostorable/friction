import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('id')
      .eq('user_id', user.id)
      .eq('integration_type', 'jira')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'No Jira integration found' }, { status: 404 });
    }

    // Admin client for token deletion
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Delete tokens
    await supabaseAdmin
      .from('oauth_tokens')
      .delete()
      .eq('integration_id', integration.id);

    // Delete theme links (cascades will handle jira_issues)
    await supabase
      .from('theme_jira_links')
      .delete()
      .eq('user_id', user.id);

    // Delete jira issues
    await supabase
      .from('jira_issues')
      .delete()
      .eq('user_id', user.id)
      .eq('integration_id', integration.id);

    // Delete integration
    await supabase
      .from('integrations')
      .delete()
      .eq('id', integration.id);

    console.log('Jira integration disconnected successfully');

    return NextResponse.json({ success: true, message: 'Jira disconnected successfully' });

  } catch (err) {
    console.error('Jira disconnect error:', err);
    return NextResponse.json({
      error: 'Failed to disconnect Jira',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}
