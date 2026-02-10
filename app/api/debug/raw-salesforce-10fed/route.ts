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

    // Query for 10 Federal Storage with ALL address fields
    const query = `SELECT Id,Name,ParentId,MRR_MVR__c,Industry,Type,ShippingStreet,ShippingCity,ShippingState,ShippingPostalCode,ShippingCountry,Parent_Street__c,Parent_City__c,Parent_State__c,Parent_Zip__c,BillingStreet,BillingCity,BillingState,BillingPostalCode,BillingCountry,smartystreets__Shipping_Latitude__c,smartystreets__Shipping_Longitude__c,smartystreets__Billing_Latitude__c,smartystreets__Billing_Longitude__c,smartystreets__Shipping_Address_Status__c,smartystreets__Shipping_Verified__c FROM Account WHERE (Name LIKE '%10 Federal%' OR Name LIKE '%Ten Federal%') ORDER BY Name LIMIT 10`;

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

    return NextResponse.json({
      found: data.records?.length || 0,
      accounts: data.records?.map((acc: any) => ({
        name: acc.Name,
        id: acc.Id,
        parentId: acc.ParentId,
        mrr: acc.MRR_MVR__c,
        industry: acc.Industry,
        type: acc.Type,
        shipping: {
          street: acc.ShippingStreet,
          city: acc.ShippingCity,
          state: acc.ShippingState,
          zip: acc.ShippingPostalCode,
          country: acc.ShippingCountry,
          lat: acc.smartystreets__Shipping_Latitude__c,
          lng: acc.smartystreets__Shipping_Longitude__c,
          verified: acc.smartystreets__Shipping_Verified__c
        },
        parent: {
          street: acc.Parent_Street__c,
          city: acc.Parent_City__c,
          state: acc.Parent_State__c,
          zip: acc.Parent_Zip__c
        },
        billing: {
          street: acc.BillingStreet,
          city: acc.BillingCity,
          state: acc.BillingState,
          zip: acc.BillingPostalCode,
          country: acc.BillingCountry,
          lat: acc.smartystreets__Billing_Latitude__c,
          lng: acc.smartystreets__Billing_Longitude__c
        }
      }))
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({
      error: 'Failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
