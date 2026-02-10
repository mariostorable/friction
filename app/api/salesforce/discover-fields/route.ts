import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * GET /api/salesforce/discover-fields
 *
 * Discovers all address-related fields in the Salesforce Account object.
 * Useful for finding corporate address, headquarters, or other location fields.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Salesforce integration
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

    // Get decrypted token
    const tokens = await getDecryptedToken(supabase, integration.id);
    if (!tokens) {
      return NextResponse.json({ error: 'No access token found' }, { status: 400 });
    }

    // Describe Account object to get all fields
    const response = await fetch(
      `${integration.instance_url}/services/data/v59.0/sobjects/Account/describe`,
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
        error: 'Failed to describe Account object',
        details: errorText
      }, { status: 500 });
    }

    const metadata = await response.json();

    // Filter for address-related fields
    const addressFields = metadata.fields.filter((field: any) => {
      const name = field.name.toLowerCase();
      const label = field.label.toLowerCase();

      return name.includes('address') ||
             name.includes('street') ||
             name.includes('city') ||
             name.includes('state') ||
             name.includes('zip') ||
             name.includes('postal') ||
             name.includes('country') ||
             name.includes('latitude') ||
             name.includes('longitude') ||
             name.includes('location') ||
             name.includes('corporate') ||
             name.includes('headquarters') ||
             name.includes('hq') ||
             label.includes('address') ||
             label.includes('corporate') ||
             label.includes('headquarters');
    });

    // Format the results for easy reading
    const formattedFields = addressFields.map((field: any) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      custom: field.custom,
      apiName: field.name,
    }));

    // Group by type for better organization
    const grouped = {
      standard: formattedFields.filter((f: any) => !f.custom),
      custom: formattedFields.filter((f: any) => f.custom),
    };

    return NextResponse.json({
      success: true,
      total_fields: formattedFields.length,
      standard_fields: grouped.standard.length,
      custom_fields: grouped.custom.length,
      fields: grouped,
      all_fields: formattedFields, // Flat list for convenience
    });

  } catch (error) {
    console.error('Error discovering fields:', error);
    return NextResponse.json({
      error: 'Failed to discover fields',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
