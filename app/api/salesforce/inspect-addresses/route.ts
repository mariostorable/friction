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

    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
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

    // Use encryption helper to get tokens
    const { getDecryptedToken } = await import('@/lib/encryption');
    let tokens;
    try {
      tokens = await getDecryptedToken(supabase, integration.id);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to decrypt tokens', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }

    // Helper function to refresh Salesforce token if needed
    const refreshSalesforceToken = async () => {
      const refreshResponse = await fetch(`${integration.instance_url}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.SALESFORCE_CLIENT_ID!,
          client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
          refresh_token: tokens.refresh_token,
        }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Failed to refresh Salesforce token');
      }

      const refreshData = await refreshResponse.json();

      await supabase
        .from('integrations')
        .update({
          credentials: {
            ...tokens,
            access_token: refreshData.access_token,
          },
          token_expires_at: new Date(Date.now() + 7200000).toISOString(),
        })
        .eq('id', integration.id);

      return refreshData.access_token;
    };

    // Fetch specific accounts by name
    const fetchAccount = async (accessToken: string, accountName: string) => {
      // First, find the account ID
      const searchQuery = `SELECT Id FROM Account WHERE Name LIKE '%${accountName}%' LIMIT 1`;

      const searchResponse = await fetch(
        `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!searchResponse.ok) {
        return { error: `Failed to find account: ${accountName}` };
      }

      const searchData = await searchResponse.json();

      if (!searchData.records || searchData.records.length === 0) {
        return { error: `Account not found: ${accountName}` };
      }

      const accountId = searchData.records[0].Id;

      // Now fetch ALL fields for this account
      const detailResponse = await fetch(
        `${integration.instance_url}/services/data/v59.0/sobjects/Account/${accountId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!detailResponse.ok) {
        return { error: `Failed to fetch account details: ${accountName}` };
      }

      return await detailResponse.json();
    };

    // Check if tokens are valid
    console.log('Decrypted tokens:', { hasTokens: !!tokens, tokenKeys: tokens ? Object.keys(tokens) : [] });

    if (!tokens || !tokens.access_token) {
      return NextResponse.json({
        error: 'Invalid tokens',
        details: 'No access token found. Please reconnect Salesforce.',
        debug: { hasTokens: !!tokens, tokenKeys: tokens ? Object.keys(tokens) : [] }
      }, { status: 400 });
    }

    // Try to fetch accounts, refresh token if needed
    let accessToken = tokens.access_token;

    let eliteStorData = await fetchAccount(accessToken, 'Elite-Stor');

    // If 401, refresh token and retry
    if (eliteStorData.error && eliteStorData.error.includes('401')) {
      accessToken = await refreshSalesforceToken();
      eliteStorData = await fetchAccount(accessToken, 'Elite-Stor');
    }

    let federalStorageData = await fetchAccount(accessToken, '10 Federal Storage');

    // Search for address fields in the data
    const findAddressFields = (data: any, searchAddress: string) => {
      const results: any = {};
      const searchLower = searchAddress.toLowerCase();

      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'string') {
          if (value.toLowerCase().includes(searchLower) ||
              value.toLowerCase().includes('dixie') ||
              value.toLowerCase().includes('atlantic') ||
              value.toLowerCase().includes('raleigh') ||
              value.toLowerCase().includes('west palm beach')) {
            results[key] = value;
          }
        }
      }

      return results;
    };

    const eliteStorAddressFields = eliteStorData.error ? {} : findAddressFields(eliteStorData, '2751');
    const federalStorageAddressFields = federalStorageData.error ? {} : findAddressFields(federalStorageData, '3301');

    return NextResponse.json({
      eliteStor: {
        name: eliteStorData.Name,
        found_address_fields: eliteStorAddressFields,
        all_shipping_fields: {
          ShippingStreet: eliteStorData.ShippingStreet,
          ShippingCity: eliteStorData.ShippingCity,
          ShippingState: eliteStorData.ShippingState,
          ShippingPostalCode: eliteStorData.ShippingPostalCode,
          ShippingCountry: eliteStorData.ShippingCountry,
        },
        all_billing_fields: {
          BillingStreet: eliteStorData.BillingStreet,
          BillingCity: eliteStorData.BillingCity,
          BillingState: eliteStorData.BillingState,
          BillingPostalCode: eliteStorData.BillingPostalCode,
          BillingCountry: eliteStorData.BillingCountry,
        },
      },
      federalStorage: {
        name: federalStorageData.Name,
        found_address_fields: federalStorageAddressFields,
        all_shipping_fields: {
          ShippingStreet: federalStorageData.ShippingStreet,
          ShippingCity: federalStorageData.ShippingCity,
          ShippingState: federalStorageData.ShippingState,
          ShippingPostalCode: federalStorageData.ShippingPostalCode,
          ShippingCountry: federalStorageData.ShippingCountry,
        },
        all_billing_fields: {
          BillingStreet: federalStorageData.BillingStreet,
          BillingCity: federalStorageData.BillingCity,
          BillingState: federalStorageData.BillingState,
          BillingPostalCode: federalStorageData.BillingPostalCode,
          BillingCountry: federalStorageData.BillingCountry,
        },
      },
    });

  } catch (error: any) {
    console.error('Error inspecting addresses:', error);
    return NextResponse.json(
      { error: 'Failed to inspect addresses', details: error.message },
      { status: 500 }
    );
  }
}
