import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const salesforceId = searchParams.get('salesforce_id');

    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }

    if (!salesforceId) {
      return NextResponse.json({ error: 'salesforce_id required' }, { status: 400 });
    }

    // Get Salesforce tokens
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .single();

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Salesforce not connected', details: integrationError }, { status: 400 });
    }

    // Create admin client for decryption
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

    // Use encryption helper to get tokens
    const { getDecryptedToken } = await import('@/lib/encryption');
    let tokens;
    try {
      tokens = await getDecryptedToken(supabaseAdmin, integration.id);
    } catch (error) {
      console.error('Failed to decrypt tokens:', error);
      return NextResponse.json({ error: 'Failed to decrypt tokens', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }

    if (!tokens || !tokens.access_token) {
      return NextResponse.json({
        error: 'No access token',
        details: 'Access token not found in decrypted tokens. Please reconnect Salesforce.'
      }, { status: 400 });
    }

    // Fetch account by Salesforce ID
    const accessToken = tokens.access_token;

    const response = await fetch(
      `${integration.instance_url}/services/data/v59.0/sobjects/Account/${salesforceId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch account: ${salesforceId}`, status: response.status }, { status: 500 });
    }

    const accountData = await response.json();

    // Extract all address-related fields
    const addressFields = {
      shipping: {
        ShippingStreet: accountData.ShippingStreet,
        ShippingCity: accountData.ShippingCity,
        ShippingState: accountData.ShippingState,
        ShippingPostalCode: accountData.ShippingPostalCode,
        ShippingCountry: accountData.ShippingCountry,
      },
      billing: {
        BillingStreet: accountData.BillingStreet,
        BillingCity: accountData.BillingCity,
        BillingState: accountData.BillingState,
        BillingPostalCode: accountData.BillingPostalCode,
        BillingCountry: accountData.BillingCountry,
      },
      parent: {
        Parent_Street__c: accountData.Parent_Street__c,
        Parent_City__c: accountData.Parent_City__c,
        Parent_State__c: accountData.Parent_State__c,
        Parent_Zip__c: accountData.Parent_Zip__c,
      },
      smartystreets: {
        shipping_lat: accountData.smartystreets__Shipping_Latitude__c,
        shipping_lng: accountData.smartystreets__Shipping_Longitude__c,
        billing_lat: accountData.smartystreets__Billing_Latitude__c,
        billing_lng: accountData.smartystreets__Billing_Longitude__c,
        shipping_status: accountData.smartystreets__Shipping_Address_Status__c,
      }
    };

    return NextResponse.json({
      salesforce_id: salesforceId,
      name: accountData.Name,
      address_fields: addressFields,
      all_fields: Object.keys(accountData).sort()
    });

  } catch (error: any) {
    console.error('Error inspecting account:', error);
    return NextResponse.json(
      { error: 'Failed to inspect account', details: error.message },
      { status: 500 }
    );
  }
}
