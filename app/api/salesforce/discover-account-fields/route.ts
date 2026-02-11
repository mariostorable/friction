import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Discover what fields exist in Salesforce Account object
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get Salesforce integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .order('connected_at', { ascending: false })
      .limit(1)
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'No Salesforce integration found' }, { status: 404 });
    }

    // Get tokens
    const { data: tokens } = await supabase
      .from('oauth_tokens')
      .select('access_token')
      .eq('integration_id', integration.id)
      .single();

    if (!tokens) {
      return NextResponse.json({ error: 'No tokens found' }, { status: 404 });
    }

    // Query Salesforce Describe API
    const describeUrl = `${integration.instance_url}/services/data/v59.0/sobjects/Account/describe`;

    const response = await fetch(describeUrl, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Salesforce API error', details: await response.text() },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Filter for address-related fields
    const addressFields = data.fields.filter((f: any) =>
      f.name.toLowerCase().includes('address') ||
      f.name.toLowerCase().includes('street') ||
      f.name.toLowerCase().includes('city') ||
      f.name.toLowerCase().includes('state') ||
      f.name.toLowerCase().includes('zip') ||
      f.name.toLowerCase().includes('postal') ||
      f.name.toLowerCase().includes('property') ||
      f.name.toLowerCase().includes('shipping') ||
      f.name.toLowerCase().includes('billing')
    ).map((f: any) => ({ name: f.name, type: f.type, label: f.label }));

    // Check for SmartyStreets fields
    const smartyFields = data.fields.filter((f: any) =>
      f.name.toLowerCase().includes('smarty')
    ).map((f: any) => ({ name: f.name, type: f.type, label: f.label }));

    // Check specifically for Property_ custom fields
    const propertyFields = data.fields.filter((f: any) =>
      f.name.startsWith('Property_') || f.name.includes('Property')
    ).map((f: any) => ({ name: f.name, type: f.type, label: f.label }));

    return NextResponse.json({
      totalFields: data.fields.length,
      addressFields,
      smartyFields,
      propertyFields,
    });

  } catch (error) {
    console.error('Error discovering fields:', error);
    return NextResponse.json(
      { error: 'Internal error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
