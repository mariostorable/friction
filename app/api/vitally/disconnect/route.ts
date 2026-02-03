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

    // Get the integration to find its ID
    const { data: integration } = await supabase
      .from('integrations')
      .select('id')
      .eq('user_id', user.id)
      .eq('integration_type', 'vitally')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'No Vitally integration found' }, { status: 404 });
    }

    // Use admin client to delete oauth tokens
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

    // Delete oauth tokens
    await supabaseAdmin
      .from('oauth_tokens')
      .delete()
      .eq('integration_id', integration.id);

    // Mark integration as inactive
    await supabase
      .from('integrations')
      .update({ status: 'inactive' })
      .eq('id', integration.id);

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('Vitally disconnect error:', err);
    return NextResponse.json({
      error: 'Failed to disconnect from Vitally',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}
