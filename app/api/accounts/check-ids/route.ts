import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get total accounts
    const { count: totalAccounts } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Get accounts WITH salesforce_id
    const { count: accountsWithSfId } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('salesforce_id', 'is', null);

    // Get sample accounts with their IDs
    const { data: sampleAccounts } = await supabase
      .from('accounts')
      .select('name, salesforce_id')
      .eq('user_id', user.id)
      .limit(20);

    return NextResponse.json({
      success: true,
      summary: {
        total_accounts: totalAccounts,
        accounts_with_salesforce_id: accountsWithSfId,
        accounts_without_salesforce_id: (totalAccounts || 0) - (accountsWithSfId || 0),
      },
      sample_accounts: sampleAccounts,
    });

  } catch (error) {
    console.error('Check IDs error:', error);
    return NextResponse.json({
      error: 'Failed to check account IDs',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
