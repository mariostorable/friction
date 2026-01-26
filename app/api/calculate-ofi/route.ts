import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: recentCards } = await supabase
      .from('friction_cards')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .gte('created_at', fourteenDaysAgo.toISOString());

    if (!recentCards || recentCards.length === 0) {
      return NextResponse.json({ message: 'No friction data to calculate', ofi_score: 0 });
    }

    // Get case volume (count of raw inputs for this account)
    const { count: caseVolume } = await supabase
      .from('raw_inputs')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('user_id', user.id);

    const severityWeights = { 1: 0.5, 2: 1, 3: 2, 4: 5, 5: 10 };
    const weightedScore = recentCards.reduce((sum, card) => {
      return sum + (severityWeights[card.severity as keyof typeof severityWeights] || 1);
    }, 0);

    const ofiScore = Math.min(100, Math.round(weightedScore * 2));
    const highSeverityCount = recentCards.filter(c => c.severity >= 4).length;

    const themeCounts: Record<string, { count: number; totalSeverity: number }> = {};
    recentCards.forEach(card => {
      if (!themeCounts[card.theme_key]) {
        themeCounts[card.theme_key] = { count: 0, totalSeverity: 0 };
      }
      themeCounts[card.theme_key].count++;
      themeCounts[card.theme_key].totalSeverity += card.severity;
    });

    const topThemes = Object.entries(themeCounts)
      .map(([theme, data]) => ({
        theme_key: theme,
        count: data.count,
        avg_severity: Math.round((data.totalSeverity / data.count) * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const { data: previousSnapshot } = await supabase
      .from('account_snapshots')
      .select('ofi_score')
      .eq('account_id', accountId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    let trendDirection = 'stable';
    let trendVsPrior = 0;

    if (previousSnapshot && previousSnapshot.ofi_score > 0) {
      trendVsPrior = Math.round(((ofiScore - previousSnapshot.ofi_score) / previousSnapshot.ofi_score) * 100);
      if (trendVsPrior > 15) trendDirection = 'worsening';
      else if (trendVsPrior < -15) trendDirection = 'improving';
    }

    const today = new Date().toISOString().split('T')[0];

    // Use admin client to delete existing snapshot
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    await supabaseAdmin
      .from('account_snapshots')
      .delete()
      .eq('account_id', accountId)
      .eq('snapshot_date', today);

    const { data: snapshot, error: snapshotError} = await supabase
      .from('account_snapshots')
      .insert({
        account_id: accountId,
        snapshot_date: today,
        ofi_score: ofiScore,
        friction_card_count: recentCards.length,
        high_severity_count: highSeverityCount,
        case_volume: caseVolume || 0,
        top_themes: topThemes,
        trend_vs_prior_period: trendVsPrior,
        trend_direction: trendDirection,
        score_breakdown: {
          severity_weighted: weightedScore,
          card_count: recentCards.length,
        },
      })
      .select()
      .single();

    if (snapshotError) {
      console.error('Snapshot error:', snapshotError);
      return NextResponse.json({ error: 'Failed to create snapshot', details: snapshotError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ofi_score: ofiScore,
      friction_cards: recentCards.length,
      high_severity: highSeverityCount,
      trend: trendDirection,
      top_themes: topThemes,
    });

  } catch (error) {
    console.error('OFI calculation error:', error);
    return NextResponse.json({ 
      error: 'OFI calculation failed', 
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
