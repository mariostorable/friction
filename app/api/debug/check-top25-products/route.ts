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

    // Get Top 25 Storage portfolio
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', user.id)
      .eq('portfolio_type', 'top_25_edge')
      .single();

    if (!portfolio) {
      return NextResponse.json({ error: 'No Top 25 portfolio found' });
    }

    // Get the accounts in the portfolio
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, products, arr, vertical')
      .in('id', portfolio.account_ids)
      .order('arr', { ascending: false });

    // Check which ones have EDGE/SiteLink
    const withEDGE = accounts?.filter(a => a.products?.includes('EDGE')) || [];
    const withSiteLink = accounts?.filter(a => a.products?.includes('SiteLink')) || [];
    const withNeither = accounts?.filter(a => !a.products?.includes('EDGE') && !a.products?.includes('SiteLink')) || [];

    return NextResponse.json({
      portfolioName: portfolio.name,
      totalAccounts: accounts?.length || 0,
      withEDGE: withEDGE.length,
      withSiteLink: withSiteLink.length,
      withNeither: withNeither.length,
      samples: {
        edge: withEDGE.slice(0, 3).map(a => ({ name: a.name, products: a.products, arr: a.arr })),
        sitelink: withSiteLink.slice(0, 3).map(a => ({ name: a.name, products: a.products, arr: a.arr })),
        neither: withNeither.slice(0, 5).map(a => ({ name: a.name, products: a.products, arr: a.arr, vertical: a.vertical }))
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
