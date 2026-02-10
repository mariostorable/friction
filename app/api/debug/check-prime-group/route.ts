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

    // Check for Prime Group Holdings
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .or('name.ilike.%Prime Group%,name.ilike.%Prime%Holdings%');

    const results = accounts?.map(acc => ({
      name: acc.name,
      status: acc.status,
      arr: acc.arr,
      propertyAddress: acc.property_address_street ?
        `${acc.property_address_street}, ${acc.property_address_city}, ${acc.property_address_state} ${acc.property_address_postal_code}` : 'NO ADDRESS',
      hasCoordinates: !!(acc.latitude && acc.longitude),
      coordinates: acc.latitude && acc.longitude ? `${acc.latitude}, ${acc.longitude}` : 'NO COORDINATES',
      geocode_source: acc.geocode_source,
      willShowInDropdown: acc.status === 'active' && acc.latitude && acc.longitude,
      reason: acc.status !== 'active' ? 'Status not active' :
              !acc.latitude ? 'Missing coordinates' :
              'Should show in dropdown'
    }));

    return NextResponse.json({
      found: accounts?.length || 0,
      accounts: results || [],
      searchFilters: {
        required: [
          "status = 'active'",
          "latitude IS NOT NULL",
          "longitude IS NOT NULL"
        ]
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
