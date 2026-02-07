import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * Test Salesforce connection endpoint
 * Returns detailed diagnostics about the Salesforce integration
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('🔍 Testing Salesforce connection for user:', user.id);

    // Get integration
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .maybeSingle();

    if (intError) {
      return NextResponse.json({
        error: 'Failed to fetch integration',
        details: intError.message
      }, { status: 500 });
    }

    if (!integration) {
      return NextResponse.json({
        error: 'Salesforce not connected',
        message: 'Please connect Salesforce from Settings'
      }, { status: 400 });
    }

    // Get tokens
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

    let tokens;
    try {
      tokens = await getDecryptedToken(supabaseAdmin, integration.id);
    } catch (error) {
      return NextResponse.json({
        error: 'Failed to decrypt tokens',
        details: error instanceof Error ? error.message : 'Unknown error',
        action: 'Please reconnect Salesforce from Settings'
      }, { status: 500 });
    }

    if (!tokens) {
      return NextResponse.json({
        error: 'No tokens found',
        action: 'Please reconnect Salesforce from Settings'
      }, { status: 400 });
    }

    // Test 1: Simple API call to verify credentials
    console.log('Test 1: Verifying credentials...');
    const identityResponse = await fetch(`${integration.instance_url}/services/oauth2/userinfo`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    if (!identityResponse.ok) {
      const errorText = await identityResponse.text();
      return NextResponse.json({
        error: 'Invalid or expired token',
        details: errorText,
        status: identityResponse.status,
        action: 'Please reconnect Salesforce from Settings'
      }, { status: 401 });
    }

    const userInfo = await identityResponse.json();
    console.log('✅ Credentials valid. User:', userInfo.name);

    // Test 2: Simple SOQL query
    console.log('Test 2: Testing simple SOQL query...');
    const simpleQuery = 'SELECT Id, Name FROM Account LIMIT 1';
    const simpleResponse = await fetch(
      `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(simpleQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!simpleResponse.ok) {
      const errorText = await simpleResponse.text();
      return NextResponse.json({
        error: 'Simple query failed',
        query: simpleQuery,
        details: errorText,
        status: simpleResponse.status
      }, { status: 500 });
    }

    const simpleData = await simpleResponse.json();
    console.log('✅ Simple query works. Found', simpleData.totalSize, 'accounts');

    // Test 3: Full query with all fields (the one used in sync)
    console.log('Test 3: Testing full sync query...');
    const fullQuery = 'SELECT Id,Name,AnnualRevenue,Industry,Type,Owner.Name,CreatedDate,(SELECT Id FROM Assets) FROM Account WHERE ParentId=null ORDER BY AnnualRevenue DESC NULLS LAST LIMIT 5';

    const fullResponse = await fetch(
      `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(fullQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!fullResponse.ok) {
      const errorText = await fullResponse.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = { message: errorText };
      }

      return NextResponse.json({
        error: 'Full sync query failed',
        query: fullQuery,
        details: errorJson,
        status: fullResponse.status,
        help: 'This query is missing fields in your Salesforce org. Check which field is causing the error.',
        action: 'You may need to adjust the query or add custom fields to Salesforce'
      }, { status: 500 });
    }

    const fullData = await fullResponse.json();
    console.log('✅ Full query works. Found', fullData.totalSize, 'accounts');

    return NextResponse.json({
      success: true,
      message: 'All Salesforce connection tests passed!',
      integration: {
        status: integration.status,
        instance_url: integration.instance_url,
        connected_at: integration.connected_at,
        last_synced_at: integration.last_synced_at,
      },
      user_info: {
        name: userInfo.name,
        email: userInfo.email,
        organization_id: userInfo.organization_id,
      },
      tests: {
        credentials: '✅ Valid',
        simple_query: `✅ ${simpleData.totalSize} accounts found`,
        full_query: `✅ ${fullData.totalSize} accounts found`,
      },
      sample_accounts: fullData.records?.slice(0, 3).map((acc: any) => ({
        id: acc.Id,
        name: acc.Name,
        annual_revenue: acc.AnnualRevenue,
        type: acc.Type,
      })),
    });

  } catch (error) {
    console.error('Test connection error:', error);
    return NextResponse.json({
      error: 'Connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
