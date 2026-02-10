import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }

    // Get Salesforce integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .single();

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Salesforce not connected' }, { status: 400 });
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

    // Get decrypted tokens
    const { getDecryptedToken } = await import('@/lib/encryption');
    let tokens;
    try {
      tokens = await getDecryptedToken(supabaseAdmin, integration.id);
    } catch (error) {
      console.error('Failed to decrypt tokens:', error);
      return NextResponse.json({ error: 'Failed to decrypt tokens' }, { status: 500 });
    }

    if (!tokens || !tokens.access_token) {
      return NextResponse.json({ error: 'No access token' }, { status: 400 });
    }

    const accessToken = tokens.access_token;

    // Fetch the two specific accounts from Salesforce
    const accountsToFix = [
      { id: '0010y00001kPeJmAAK', name: '10 Federal Storage - CORP.' },
      { id: '001C000001HOz9tIAD', name: 'Elite-Stor Storage - CORP' }
    ];

    const results = [];

    for (const account of accountsToFix) {
      // Fetch from Salesforce
      const response = await fetch(
        `${integration.instance_url}/services/data/v59.0/sobjects/Account/${account.id}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        results.push({ account: account.name, error: 'Failed to fetch from Salesforce' });
        continue;
      }

      const sfData = await response.json();

      // Map address with priority: Parent → Billing → Shipping
      const propertyStreet = sfData.Parent_Street__c || sfData.BillingStreet || sfData.ShippingStreet || null;
      const propertyCity = sfData.Parent_City__c || sfData.BillingCity || sfData.ShippingCity || null;
      const propertyState = sfData.Parent_State__c || sfData.BillingState || sfData.ShippingState || null;
      const propertyPostalCode = sfData.Parent_Zip__c || sfData.BillingPostalCode || sfData.ShippingPostalCode || null;
      const propertyCountry = sfData.BillingCountry || sfData.ShippingCountry || null;

      // First, delete all duplicate entries for this salesforce_id
      const { error: deleteError } = await supabase
        .from('accounts')
        .delete()
        .eq('salesforce_id', account.id);

      if (deleteError) {
        results.push({ account: account.name, error: 'Failed to delete duplicates', details: deleteError });
        continue;
      }

      // Now insert a single clean record
      const { data: insertedAccount, error: insertError } = await supabase
        .from('accounts')
        .insert({
          user_id: userId,
          salesforce_id: account.id,
          name: sfData.Name,
          arr: sfData.AnnualRevenue || 0,
          vertical: sfData.Industry || 'Storage',
          owner_name: sfData.Owner?.Name || null,
          property_address_street: propertyStreet,
          property_address_city: propertyCity,
          property_address_state: propertyState,
          property_address_postal_code: propertyPostalCode,
          property_address_country: propertyCountry,
          billing_address_street: sfData.BillingStreet,
          billing_address_city: sfData.BillingCity,
          billing_address_state: sfData.BillingState,
          billing_address_postal_code: sfData.BillingPostalCode,
          billing_address_country: sfData.BillingCountry,
        })
        .select()
        .single();

      if (insertError) {
        results.push({ account: account.name, error: 'Failed to insert', details: insertError });
      } else {
        results.push({
          account: account.name,
          success: true,
          address: `${propertyStreet}, ${propertyCity}, ${propertyState} ${propertyPostalCode}`
        });
      }
    }

    return NextResponse.json({ results });

  } catch (error: any) {
    console.error('Error fixing accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fix accounts', details: error.message },
      { status: 500 }
    );
  }
}
