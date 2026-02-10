import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Find 10 Federal Storage accounts
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .or('name.ilike.%10 Federal%,name.ilike.%Ten Federal%')
      .eq('status', 'active');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Check what addresses they have
    const accountDetails = accounts?.map(acc => ({
      name: acc.name,
      salesforce_id: acc.salesforce_id,
      ultimate_parent_id: acc.ultimate_parent_id,
      property_street: acc.property_address_street,
      property_city: acc.property_address_city,
      property_state: acc.property_address_state,
      billing_street: acc.billing_address_street,
      billing_city: acc.billing_address_city,
      billing_state: acc.billing_address_state,
      latitude: acc.latitude,
      longitude: acc.longitude,
      geocode_source: acc.geocode_source,
      metadata: acc.metadata
    }));

    return NextResponse.json({
      found: accounts?.length || 0,
      accounts: accountDetails
    });

  } catch (error: any) {
    console.error('Error checking 10 Federal:', error);
    return NextResponse.json(
      { error: 'Failed to check', details: error.message },
      { status: 500 }
    );
  }
}
