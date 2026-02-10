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

    // Check for the three corporate accounts in database
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .or('name.ilike.%10 Federal%CORP%,name.ilike.%Elite-Stor%CORP%,name.ilike.%Prime Group%CORP%');

    const results = accounts?.map(acc => ({
      name: acc.name,
      id: acc.id,
      salesforce_id: acc.salesforce_id,
      vertical: acc.vertical,
      status: acc.status,
      arr: acc.arr,
      propertyAddress: acc.property_address_street ?
        `${acc.property_address_street}, ${acc.property_address_city}, ${acc.property_address_state} ${acc.property_address_postal_code}` : null,
      billingAddress: acc.billing_address_street ?
        `${acc.billing_address_street}, ${acc.billing_address_city}, ${acc.billing_address_state} ${acc.billing_address_postal_code}` : null,
      coordinates: acc.latitude && acc.longitude ?
        `${acc.latitude}, ${acc.longitude}` : null,
      geocode_source: acc.geocode_source,
      metadata: acc.metadata
    }));

    return NextResponse.json({
      found: accounts?.length || 0,
      accounts: results || []
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
