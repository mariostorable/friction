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

    // Get top storage accounts by ARR
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, products, arr, vertical')
      .eq('user_id', user.id)
      .eq('vertical', 'storage')
      .eq('status', 'active')
      .order('arr', { ascending: false })
      .limit(30);

    const withEDGE = accounts?.filter(a => a.products?.includes('EDGE')) || [];
    const withSiteLink = accounts?.filter(a => a.products?.includes('SiteLink')) || [];
    const withSoftware = accounts?.filter(a => a.products?.includes('Software')) || [];

    return NextResponse.json({
      total: accounts?.length || 0,
      withEDGE: withEDGE.length,
      withSiteLink: withSiteLink.length,
      withAnySoftware: withSoftware.length,
      top10: accounts?.slice(0, 10).map(a => ({
        name: a.name,
        arr: a.arr,
        products: a.products
      }))
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
