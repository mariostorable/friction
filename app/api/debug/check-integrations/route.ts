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

    // Get all integrations for this user
    const { data: integrations, error: intError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id);

    if (intError) {
      return NextResponse.json({
        error: 'Failed to query integrations',
        details: intError.message
      }, { status: 500 });
    }

    // Get Salesforce integration specifically
    const { data: sfIntegration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .single();

    const response: any = {
      userId: user.id,
      totalIntegrations: integrations?.length || 0,
      integrations: integrations?.map(i => ({
        id: i.id,
        type: i.integration_type,
        hasCredentials: !!i.credentials,
        instanceUrl: i.instance_url,
        createdAt: i.created_at
      })),
      salesforce: null,
      salesforceTest: null
    };

    if (sfIntegration && sfIntegration.credentials) {
      response.salesforce = {
        found: true,
        instanceUrl: sfIntegration.instance_url,
        hasAccessToken: !!(sfIntegration.credentials as any).access_token,
        credentialsKeys: Object.keys(sfIntegration.credentials || {})
      };

      // Try a simple Salesforce query
      try {
        const tokens = sfIntegration.credentials as any;
        const testQuery = `SELECT Id,Name,MRR_MVR__c FROM Account WHERE MRR_MVR__c > 0 LIMIT 1`;

        const sfResponse = await fetch(
          `${sfIntegration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(testQuery)}`,
          {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        response.salesforceTest = {
          status: sfResponse.status,
          ok: sfResponse.ok,
          query: testQuery
        };

        if (sfResponse.ok) {
          const data = await sfResponse.json();
          response.salesforceTest.recordsFound = data.records?.length || 0;
          response.salesforceTest.sampleRecord = data.records?.[0] || null;
        } else {
          const errorText = await sfResponse.text();
          response.salesforceTest.error = errorText;
        }
      } catch (sfError: any) {
        response.salesforceTest = {
          error: 'Failed to test Salesforce',
          details: sfError.message
        };
      }
    } else {
      response.salesforce = {
        found: false,
        message: 'No Salesforce integration found or missing credentials'
      };
    }

    return NextResponse.json(response);

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
