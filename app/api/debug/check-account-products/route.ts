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

    // Get top 10 storage accounts by ARR
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, products, arr, vertical')
      .eq('user_id', user.id)
      .eq('vertical', 'storage')
      .order('arr', { ascending: false })
      .limit(10);

    return NextResponse.json({
      total: accounts?.length || 0,
      accounts: accounts?.map(a => ({
        name: a.name,
        arr: a.arr,
        products: a.products,
        hasEDGE: a.products?.includes('EDGE') || false,
        hasSiteLink: a.products?.includes('SiteLink') || false
      }))
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
