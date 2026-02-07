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

    // Try with custom fields first
    let fullQuery = 'SELECT Id,Name,dL_Product_s_Corporate_Name__c,MRR_MVR__c,Industry,Type,Owner.Name,CreatedDate,Current_FMS__c,Online_Listing_Service__c,Current_Website_Provider__c,Current_Payment_Provider__c,Insurance_Company__c,Gate_System__c,LevelOfService__c,Managed_Account__c,VitallyClient_Success_Tier__c,Locations__c,Corp_Code__c,SE_Company_UUID__c,SpareFoot_Client_Key__c,Insurance_ZCRM_ID__c,(SELECT Id FROM Assets) FROM Account WHERE ParentId=null AND MRR_MVR__c>0 ORDER BY MRR_MVR__c DESC LIMIT 5';
    let useStandardFields = false;

    let fullResponse = await fetch(
      `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(fullQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // If custom fields don't exist, try standard fields
    if (!fullResponse.ok) {
      const errorText = await fullResponse.text();

      if (errorText.includes('INVALID_FIELD') || errorText.includes('No such column')) {
        console.log('Custom fields not found, trying standard fields...');
        useStandardFields = true;
        fullQuery = 'SELECT Id,Name,AnnualRevenue,Industry,Type,Owner.Name,CreatedDate,(SELECT Id FROM Assets) FROM Account WHERE ParentId=null ORDER BY AnnualRevenue DESC NULLS LAST LIMIT 5';

        fullResponse = await fetch(
          `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(fullQuery)}`,
          {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!fullResponse.ok) {
          const fallbackError = await fullResponse.text();
          return NextResponse.json({
            error: 'Both custom and standard field queries failed',
            details: fallbackError,
            status: fullResponse.status,
          }, { status: 500 });
        }
      } else {
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
        }, { status: 500 });
      }
    }

    const fullData = await fullResponse.json();
    console.log(`✅ Full query works. Found ${fullData.totalSize} accounts (${useStandardFields ? 'standard' : 'custom'} fields)`);

    return NextResponse.json({
      success: true,
      message: `All Salesforce connection tests passed! ${useStandardFields ? '(Using standard fields only - custom fields not available)' : '(Using custom Storable fields)'}`,
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
        full_query: `✅ ${fullData.totalSize} accounts found (${useStandardFields ? 'standard fields' : 'custom fields'})`,
      },
      sample_accounts: fullData.records?.slice(0, 3).map((acc: any) => ({
        id: acc.Id,
        name: acc.Name,
        annual_revenue: acc.AnnualRevenue || (acc.MRR_MVR__c ? acc.MRR_MVR__c * 12 : null),
        type: acc.Type,
        products: useStandardFields ? 'N/A (no custom fields)' : 'Detected from custom fields',
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
