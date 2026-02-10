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

    // Get Top 25 portfolios
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('name, account_ids')
      .eq('user_id', user.id)
      .in('portfolio_type', ['top_25_edge', 'top_25_marine']);

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({
        message: 'No Top 25 portfolios found',
        portfolios: []
      });
    }

    const results = [];

    for (const portfolio of portfolios) {
      const accountIds = portfolio.account_ids || [];

      if (accountIds.length === 0) continue;

      // Get account details
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name, status, property_address_city, property_address_state, latitude, longitude, arr')
        .in('id', accountIds);

      const accountDetails = accounts?.map(acc => ({
        name: acc.name,
        city: acc.property_address_city,
        state: acc.property_address_state,
        arr: acc.arr,
        hasCoordinates: !!(acc.latitude && acc.longitude),
        coordinates: acc.latitude && acc.longitude ?
          `${acc.latitude}, ${acc.longitude}` : 'MISSING',
        status: acc.status,
        willShowInVisitPlanner: acc.status === 'active' && acc.latitude && acc.longitude,
        reason: !acc.latitude ? 'No coordinates' :
                acc.status !== 'active' ? 'Not active' :
                'OK'
      })) || [];

      const missingCoords = accountDetails.filter(a => !a.hasCoordinates);
      const inactiveAccounts = accountDetails.filter(a => a.status !== 'active');

      results.push({
        portfolio: portfolio.name,
        totalAccounts: accountDetails.length,
        withCoordinates: accountDetails.filter(a => a.hasCoordinates).length,
        missingCoordinates: missingCoords.length,
        inactive: inactiveAccounts.length,
        willShowInVisitPlanner: accountDetails.filter(a => a.willShowInVisitPlanner).length,
        accountsMissingCoords: missingCoords,
        inactiveAccountsList: inactiveAccounts,
        allAccounts: accountDetails
      });
    }

    const totalMissing = results.reduce((sum, r) => sum + r.missingCoordinates, 0);
    const totalInactive = results.reduce((sum, r) => sum + r.inactive, 0);

    return NextResponse.json({
      summary: {
        totalMissing,
        totalInactive,
        message: totalMissing > 0 || totalInactive > 0 ?
          `${totalMissing} accounts missing coordinates, ${totalInactive} inactive` :
          'All Top 25 accounts have coordinates and are active!'
      },
      portfolios: results
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
