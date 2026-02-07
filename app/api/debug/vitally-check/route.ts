import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const searchTerm = searchParams.get('search') || '';

    // Get health score statistics from vitally_accounts
    const { data: allHealthScores } = await supabase
      .from('vitally_accounts')
      .select('health_score, account_name')
      .eq('user_id', user.id)
      .not('health_score', 'is', null)
      .limit(100);

    const healthScores = allHealthScores?.map(v => v.health_score) || [];
    const stats = healthScores.length > 0 ? {
      min: Math.min(...healthScores),
      max: Math.max(...healthScores),
      avg: healthScores.reduce((a, b) => a + b, 0) / healthScores.length,
      sample: healthScores.slice(0, 10),
      count: healthScores.length
    } : null;

    // Search accounts table if search term provided
    let accounts: any[] = [];
    let vitallyAccounts: any[] = [];
    let accountsWithVitally: any[] = [];

    if (searchTerm) {
      const { data: accountsData } = await supabase
        .from('accounts')
        .select('id, name, salesforce_id, vitally_health_score, vitally_status, vitally_nps_score')
        .eq('user_id', user.id)
        .or(`name.ilike.%${searchTerm}%,salesforce_id.ilike.%${searchTerm}%`)
        .limit(20);
      accounts = accountsData || [];

      const { data: vitallyData } = await supabase
        .from('vitally_accounts')
        .select('vitally_account_id, account_id, account_name, salesforce_account_id, health_score, status, nps_score')
        .eq('user_id', user.id)
        .or(`account_name.ilike.%${searchTerm}%,salesforce_account_id.ilike.%${searchTerm}%`)
        .limit(20);
      vitallyAccounts = vitallyData || [];

      // Also get accounts with their vitally relationships joined
      const { data: joinedData } = await supabase
        .from('accounts')
        .select(`
          id,
          name,
          salesforce_id,
          vitally_health_score,
          vitally_account:vitally_accounts(vitally_account_id, account_name, health_score)
        `)
        .eq('user_id', user.id)
        .or(`name.ilike.%${searchTerm}%,salesforce_id.ilike.%${searchTerm}%`)
        .limit(20);
      accountsWithVitally = joinedData || [];
    }

    return NextResponse.json({
      searchTerm,
      healthScoreStats: stats,
      accounts: accounts,
      vitallyAccounts: vitallyAccounts,
      accountsWithVitally: accountsWithVitally,
      accountsCount: accounts.length,
      vitallyAccountsCount: vitallyAccounts.length,
      accountsWithVitallyCount: accountsWithVitally.length
    });

  } catch (error) {
    console.error('Debug check error:', error);
    return NextResponse.json({
      error: 'Debug check failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
