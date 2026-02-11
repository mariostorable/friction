import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * Test Salesforce connection
 * Makes a simple API call to verify tokens work
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .order('connected_at', { ascending: false })
      .limit(1)
      .single();

    if (!integration) {
      return NextResponse.json({
        connected: false,
        error: 'Salesforce not connected',
        integrationError: integrationError?.message
      }, { status: 200 });
    }

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

    // Retrieve and decrypt tokens
    let tokens;
    try {
      tokens = await getDecryptedToken(supabaseAdmin, integration.id);
    } catch (error) {
      return NextResponse.json({
        connected: false,
        error: 'Failed to decrypt tokens',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 200 });
    }

    if (!tokens) {
      return NextResponse.json({
        connected: false,
        error: 'No tokens found'
      }, { status: 200 });
    }

    // Test Salesforce API with a simple query
    const testResponse = await fetch(
      `${integration.instance_url}/services/data/v59.0/query?q=SELECT+Id,Name+FROM+Account+LIMIT+1`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (testResponse.status === 401) {
      return NextResponse.json({
        connected: false,
        error: 'Access token expired or invalid',
        hasRefreshToken: !!tokens.refresh_token,
        statusCode: 401
      }, { status: 200 });
    }

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      return NextResponse.json({
        connected: false,
        error: 'Salesforce API error',
        statusCode: testResponse.status,
        details: errorText
      }, { status: 200 });
    }

    const data = await testResponse.json();

    return NextResponse.json({
      connected: true,
      integration: {
        id: integration.id,
        instanceUrl: integration.instance_url,
        connectedAt: integration.connected_at
      },
      tokens: {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresAt: tokens.expires_at
      },
      test: {
        success: true,
        recordsReturned: data.records?.length || 0
      }
    });

  } catch (error) {
    console.error('Salesforce connection test error:', error);
    return NextResponse.json({
      connected: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
