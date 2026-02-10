import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get all accounts and their verticals
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, name, vertical, arr, status')
      .eq('status', 'active');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by vertical
    const breakdown: { [key: string]: number } = {};
    const examples: { [key: string]: string[] } = {};

    accounts.forEach(acc => {
      const vertical = acc.vertical || 'Unknown';
      breakdown[vertical] = (breakdown[vertical] || 0) + 1;

      if (!examples[vertical]) {
        examples[vertical] = [];
      }
      if (examples[vertical].length < 3) {
        examples[vertical].push(acc.name);
      }
    });

    // Sort by count
    const sortedBreakdown = Object.entries(breakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([vertical, count]) => ({
        vertical,
        count,
        examples: examples[vertical]
      }));

    return NextResponse.json({
      total: accounts.length,
      breakdown: sortedBreakdown
    });

  } catch (error: any) {
    console.error('Error getting account breakdown:', error);
    return NextResponse.json(
      { error: 'Failed to get breakdown', details: error.message },
      { status: 500 }
    );
  }
}
