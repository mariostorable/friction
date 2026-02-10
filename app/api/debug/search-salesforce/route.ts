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
    const name = searchParams.get('name');

    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'name parameter required' }, { status: 400 });
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

    // Search in Salesforce
    const searchQuery = `SELECT Id, Name, ParentId, ShippingStreet, ShippingCity, ShippingState, BillingStreet, BillingCity, BillingState FROM Account WHERE Name LIKE '%${name}%' LIMIT 10`;

    const response = await fetch(
      `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(searchQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Salesforce query failed', status: response.status }, { status: 500 });
    }

    const data = await response.json();

    return NextResponse.json({
      count: data.totalSize,
      accounts: data.records.map((rec: any) => ({
        id: rec.Id,
        name: rec.Name,
        parent_id: rec.ParentId,
        is_parent: !rec.ParentId,
        shipping_address: rec.ShippingStreet ? `${rec.ShippingStreet}, ${rec.ShippingCity}, ${rec.ShippingState}` : null,
        billing_address: rec.BillingStreet ? `${rec.BillingStreet}, ${rec.BillingCity}, ${rec.BillingState}` : null
      }))
    });

  } catch (error: any) {
    console.error('Error searching Salesforce:', error);
    return NextResponse.json(
      { error: 'Failed to search Salesforce', details: error.message },
      { status: 500 }
    );
  }
}
