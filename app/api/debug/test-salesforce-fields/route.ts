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

    // Get Salesforce integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .single();

    if (integrationError || !integration) {
      return NextResponse.json({
        error: 'Salesforce not connected',
        integrationError: integrationError?.message,
        userId: user.id
      }, { status: 400 });
    }

    if (!integration.credentials) {
      return NextResponse.json({
        error: 'Salesforce has no credentials',
        integrationId: integration.id,
        hasCredentials: !!integration.credentials
      }, { status: 400 });
    }

    const tokens = integration.credentials as any;

    // Query for Westport Properties specifically
    const query = `SELECT Id,Name,MRR_MVR__c,Corp_Code__c,SE_Company_UUID__c,Current_FMS__c,Industry,Type FROM Account WHERE Name LIKE '%Westport Properties%' LIMIT 5`;

    const response = await fetch(
      `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: 'Salesforce query failed',
        status: response.status,
        details: errorText,
        query: query
      }, { status: 500 });
    }

    const data = await response.json();

    return NextResponse.json({
      instanceUrl: integration.instance_url,
      query: query,
      recordsFound: data.records?.length || 0,
      records: data.records,
      // Show what we're looking for
      expectedFields: {
        MRR_MVR__c: 'Should be ~95974.90',
        Corp_Code__c: 'Should be C245',
        SE_Company_UUID__c: 'Should be empty (SiteLink customer)',
        Current_FMS__c: 'Fallback field'
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
