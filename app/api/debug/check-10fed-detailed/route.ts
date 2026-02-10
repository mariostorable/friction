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

    // Check for all 10 Federal accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .or('name.ilike.%10 Federal%,name.ilike.%Ten Federal%');

    const results = accounts?.map(acc => ({
      name: acc.name,
      status: acc.status,
      isCorp: acc.name.includes('CORP'),
      hasAddress: !!(acc.property_address_street && acc.property_address_city),
      address: acc.property_address_street ?
        `${acc.property_address_street}, ${acc.property_address_city}, ${acc.property_address_state}` : 'NO ADDRESS',
      hasCoordinates: !!(acc.latitude && acc.longitude),
      coordinates: acc.latitude ? `${acc.latitude}, ${acc.longitude}` : 'NO COORDS',
      geocode_source: acc.geocode_source,
      willShowInVisitPlanner: acc.status === 'active' && acc.latitude && acc.longitude,
      reason: !acc.latitude ? 'Missing coordinates - needs geocoding' :
              acc.status !== 'active' ? 'Status not active' :
              'Should show'
    }));

    return NextResponse.json({
      found: accounts?.length || 0,
      accounts: results || [],
      visitPlannerRequirements: {
        citySearch: 'Accounts with coordinates within radius',
        accountDropdown: 'status=active AND latitude IS NOT NULL AND longitude IS NOT NULL'
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
