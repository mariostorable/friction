import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get total Vitally accounts
    const { count: totalVitally } = await supabase
      .from('vitally_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Get matched Vitally accounts
    const { count: matchedVitally } = await supabase
      .from('vitally_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('account_id', 'is', null);

    // Get unmatched Vitally accounts with their names
    const { data: unmatchedAccounts } = await supabase
      .from('vitally_accounts')
      .select('account_name, salesforce_account_id')
      .eq('user_id', user.id)
      .is('account_id', null)
      .limit(20);

    // Get accounts with Vitally data
    const { count: accountsWithVitally } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('vitally_health_score', 'is', null);

    // Get sample of accounts with Vitally data
    const { data: sampleMatched } = await supabase
      .from('accounts')
      .select('name, vitally_health_score, salesforce_account_id')
      .eq('user_id', user.id)
      .not('vitally_health_score', 'is', null)
      .limit(10);

    return NextResponse.json({
      success: true,
      summary: {
        total_vitally_accounts: totalVitally,
        matched_vitally_accounts: matchedVitally,
        unmatched_vitally_accounts: (totalVitally || 0) - (matchedVitally || 0),
        salesforce_accounts_with_vitally_data: accountsWithVitally,
      },
      unmatched_sample: unmatchedAccounts,
      matched_sample: sampleMatched,
    });

  } catch (error) {
    console.error('Match status error:', error);
    return NextResponse.json({
      error: 'Failed to get match status',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
