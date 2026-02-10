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

    // Get portfolios
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('name, account_ids')
      .eq('user_id', user.id);

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ message: 'No portfolios found' });
    }

    let allAccountIds: string[] = [];
    portfolios.forEach(p => {
      if (p.account_ids) {
        allAccountIds = [...allAccountIds, ...p.account_ids];
      }
    });

    // Get unique IDs
    allAccountIds = [...new Set(allAccountIds)];

    if (allAccountIds.length === 0) {
      return NextResponse.json({ message: 'No accounts in portfolios' });
    }

    // Check which ones have coordinates
    const { data: withCoords } = await supabase
      .from('accounts')
      .select('id, name')
      .in('id', allAccountIds)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    const { data: withoutCoords } = await supabase
      .from('accounts')
      .select('id, name, property_address_city, property_address_state')
      .in('id', allAccountIds)
      .is('latitude', null);

    return NextResponse.json({
      totalInPortfolios: allAccountIds.length,
      withCoordinates: withCoords?.length || 0,
      missingCoordinates: withoutCoords?.length || 0,
      accountsMissing: withoutCoords?.map(a => ({
        name: a.name,
        location: a.property_address_city && a.property_address_state ?
          `${a.property_address_city}, ${a.property_address_state}` : 'No address'
      })) || []
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
