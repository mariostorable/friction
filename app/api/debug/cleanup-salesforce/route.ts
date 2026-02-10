import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use admin client to delete everything
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

    // Get all Salesforce integrations for this user
    const { data: integrations } = await supabase
      .from('integrations')
      .select('id')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce');

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({
        message: 'No Salesforce integrations found',
        deleted: 0
      });
    }

    const integrationIds = integrations.map(i => i.id);

    // Delete oauth_tokens for these integrations
    const { error: tokensError } = await supabaseAdmin
      .from('oauth_tokens')
      .delete()
      .in('integration_id', integrationIds);

    if (tokensError) {
      console.error('Failed to delete tokens:', tokensError);
    }

    // Delete the integrations
    const { error: integrationsError } = await supabase
      .from('integrations')
      .delete()
      .in('id', integrationIds);

    if (integrationsError) {
      console.error('Failed to delete integrations:', integrationsError);
      return NextResponse.json({
        error: 'Failed to delete integrations',
        details: integrationsError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      message: 'All Salesforce integrations deleted successfully',
      deleted: integrationIds.length,
      integrationIds
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Cleanup failed', details: error.message },
      { status: 500 }
    );
  }
}
