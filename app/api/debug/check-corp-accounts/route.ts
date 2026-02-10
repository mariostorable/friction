import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Salesforce not connected' }, { status: 400 });
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

    let tokens;
    try {
      tokens = await getDecryptedToken(supabaseAdmin, integration.id);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to decrypt tokens' }, { status: 500 });
    }

    if (!tokens) {
      return NextResponse.json({ error: 'No tokens found' }, { status: 400 });
    }

    // Query for the three specific corporate accounts
    const query = `SELECT Id,Name,ParentId,MRR_MVR__c,Industry,Type,ShippingStreet,ShippingCity,ShippingState,ShippingPostalCode,Parent_Street__c,Parent_City__c,Parent_State__c,Parent_Zip__c,BillingStreet,BillingCity,BillingState,BillingPostalCode,smartystreets__Billing_Latitude__c,smartystreets__Billing_Longitude__c FROM Account WHERE (Name LIKE '%10 Federal%CORP%' OR Name LIKE '%Elite-Stor%CORP%' OR Name LIKE '%Prime Group Holdings%CORP%') ORDER BY Name`;

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
      return NextResponse.json({ error: 'Salesforce query failed', details: errorText }, { status: 500 });
    }

    const data = await response.json();

    const results = data.records?.map((acc: any) => ({
      name: acc.Name,
      id: acc.Id,
      parentId: acc.ParentId,
      mrr: acc.MRR_MVR__c,
      industry: acc.Industry,
      type: acc.Type,
      wouldBeFilteredOut: {
        noParentId: acc.ParentId !== null,
        noRevenue: !acc.MRR_MVR__c || acc.MRR_MVR__c <= 0,
        noIndustryMatch: !acc.Industry ||
          (!acc.Industry.toLowerCase().includes('storage') &&
           !acc.Industry.toLowerCase().includes('marine') &&
           !acc.Industry.toLowerCase().includes('rv'))
      },
      addresses: {
        parent: acc.Parent_Street__c ? `${acc.Parent_Street__c}, ${acc.Parent_City__c}, ${acc.Parent_State__c} ${acc.Parent_Zip__c}` : null,
        billing: acc.BillingStreet ? `${acc.BillingStreet}, ${acc.BillingCity}, ${acc.BillingState} ${acc.BillingPostalCode}` : null,
        shipping: acc.ShippingStreet ? `${acc.ShippingStreet}, ${acc.ShippingCity}, ${acc.ShippingState} ${acc.ShippingPostalCode}` : null,
        billingCoords: acc.smartystreets__Billing_Latitude__c && acc.smartystreets__Billing_Longitude__c ?
          `${acc.smartystreets__Billing_Latitude__c}, ${acc.smartystreets__Billing_Longitude__c}` : null
      }
    }));

    return NextResponse.json({
      found: data.records?.length || 0,
      accounts: results,
      syncQueryFilters: {
        description: "Current sync query requires: ParentId=null AND MRR_MVR__c>0 AND (Industry contains Storage/Marine/RV)",
        note: "If wouldBeFilteredOut shows true for any condition, that's why the account isn't syncing"
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({
      error: 'Failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
