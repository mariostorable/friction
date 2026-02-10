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

    // Get RV accounts and check their metadata
    const { data: rvAccounts } = await supabase
      .from('accounts')
      .select('name, vertical, metadata, arr')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('vertical', 'rv')
      .order('arr', { ascending: false })
      .limit(20);

    const industryBreakdown: Record<string, number> = {};
    const typeBreakdown: Record<string, number> = {};

    rvAccounts?.forEach(acc => {
      const industry = acc.metadata?.industry || 'null';
      const type = acc.metadata?.type || 'null';

      industryBreakdown[industry] = (industryBreakdown[industry] || 0) + 1;
      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
    });

    return NextResponse.json({
      totalRVAccounts: 790,
      sampleSize: rvAccounts?.length || 0,
      industryValues: industryBreakdown,
      typeValues: typeBreakdown,
      samples: rvAccounts?.slice(0, 10).map(a => ({
        name: a.name,
        industry: a.metadata?.industry,
        type: a.metadata?.type
      }))
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
