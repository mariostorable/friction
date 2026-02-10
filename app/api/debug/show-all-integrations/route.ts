import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json({
        error: 'Auth error',
        details: userError.message
      }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({
        error: 'Not authenticated',
        message: 'No user session found'
      }, { status: 401 });
    }

    // Try to get ALL integrations without filtering
    const { data: allIntegrations, error: allError } = await supabase
      .from('integrations')
      .select('id, integration_type, user_id, instance_url, created_at');

    // Try to get integrations for this user
    const { data: userIntegrations, error: userError2 } = await supabase
      .from('integrations')
      .select('id, integration_type, user_id, instance_url, created_at')
      .eq('user_id', user.id);

    return NextResponse.json({
      currentUser: {
        id: user.id,
        email: user.email
      },
      allIntegrations: {
        count: allIntegrations?.length || 0,
        error: allError?.message || null,
        list: allIntegrations || []
      },
      userIntegrations: {
        count: userIntegrations?.length || 0,
        error: userError2?.message || null,
        list: userIntegrations || []
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Unexpected error', details: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
