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

    // Get vertical counts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('vertical, products')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const verticalCounts: Record<string, number> = {};
    const withSoftware: Record<string, number> = {};

    accounts?.forEach(acc => {
      const v = acc.vertical || 'unknown';
      verticalCounts[v] = (verticalCounts[v] || 0) + 1;

      if (v === 'storage' && acc.products &&
          (acc.products.includes('EDGE') || acc.products.includes('SiteLink'))) {
        withSoftware['storage_with_software'] = (withSoftware['storage_with_software'] || 0) + 1;
      }
    });

    return NextResponse.json({
      total: accounts?.length || 0,
      verticalCounts,
      withSoftware
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
