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

    // Check vertical distribution and metadata
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, vertical, products, metadata, arr')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('arr', { ascending: false })
      .limit(50);

    const verticalSamples: Record<string, any[]> = {
      storage: [],
      marine: [],
      rv: [],
      unknown: []
    };

    accounts?.forEach(acc => {
      const v = acc.vertical || 'unknown';
      if (verticalSamples[v] && verticalSamples[v].length < 5) {
        verticalSamples[v].push({
          name: acc.name,
          vertical: acc.vertical,
          products: acc.products,
          industry: acc.metadata?.industry,
          type: acc.metadata?.type
        });
      }
    });

    // Check products field specifically
    const withEDGE = accounts?.filter(a =>
      a.vertical === 'storage' && a.products && a.products.includes('EDGE')
    ).length || 0;

    const withSiteLink = accounts?.filter(a =>
      a.vertical === 'storage' && a.products && a.products.includes('SiteLink')
    ).length || 0;

    const storageNoProducts = accounts?.filter(a =>
      a.vertical === 'storage' && (!a.products || !a.products.trim())
    ).length || 0;

    return NextResponse.json({
      top50Sample: {
        storage: verticalSamples.storage,
        marine: verticalSamples.marine,
        rv: verticalSamples.rv,
        unknown: verticalSamples.unknown
      },
      productStats: {
        storageWithEDGE: withEDGE,
        storageWithSiteLink: withSiteLink,
        storageWithoutProducts: storageNoProducts
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed', details: error.message },
      { status: 500 }
    );
  }
}
