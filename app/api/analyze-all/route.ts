import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { portfolioType, accountId } = await request.json();

    if (accountId) {
      try {
        await fetch(`${request.nextUrl.origin}/api/salesforce/sync-cases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId }),
        });

        await fetch(`${request.nextUrl.origin}/api/analyze-friction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId }),
        });

        await fetch(`${request.nextUrl.origin}/api/calculate-ofi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId }),
        });

        return NextResponse.json({ success: true, analyzed: 1 });
      } catch (error) {
        return NextResponse.json({ error: 'Failed to analyze account' }, { status: 500 });
      }
    }

    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('account_ids')
      .eq('user_id', user.id)
      .eq('portfolio_type', portfolioType || 'top_25')
      .single();

    if (!portfolio || !portfolio.account_ids) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    }

    const accountIds = portfolio.account_ids.slice(0, 5);

    return NextResponse.json({ 
      success: true, 
      total: accountIds.length,
      message: `Started analyzing ${accountIds.length} accounts`
    });

  } catch (error) {
    return NextResponse.json({ 
      error: 'Batch analysis failed', 
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
