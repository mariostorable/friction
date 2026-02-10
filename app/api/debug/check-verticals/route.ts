import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Get all accounts
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, name, vertical, products, metadata')
      .eq('status', 'active')
      .order('arr', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by vertical
    const verticalCounts: Record<string, number> = {};
    const verticalExamples: Record<string, any[]> = {};

    accounts.forEach(acc => {
      const vertical = acc.vertical || 'unknown';
      verticalCounts[vertical] = (verticalCounts[vertical] || 0) + 1;

      if (!verticalExamples[vertical]) {
        verticalExamples[vertical] = [];
      }
      if (verticalExamples[vertical].length < 5) {
        verticalExamples[vertical].push({
          name: acc.name,
          products: acc.products,
          metadata: acc.metadata
        });
      }
    });

    // Check industry field in metadata
    const industryFromMetadata: Record<string, number> = {};
    accounts.forEach(acc => {
      const industry = acc.metadata?.industry;
      if (industry) {
        industryFromMetadata[industry] = (industryFromMetadata[industry] || 0) + 1;
      }
    });

    return NextResponse.json({
      totalAccounts: accounts.length,
      verticalCounts,
      verticalExamples,
      industryFromMetadata: Object.entries(industryFromMetadata)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    });

  } catch (error: any) {
    console.error('Error checking verticals:', error);
    return NextResponse.json(
      { error: 'Failed to check verticals', details: error.message },
      { status: 500 }
    );
  }
}
