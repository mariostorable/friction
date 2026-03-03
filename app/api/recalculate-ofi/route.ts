import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/recalculate-ofi
 * Recalculates OFI scores for all portfolio accounts from existing friction cards.
 * Does NOT fetch new cases from Salesforce - just re-scores using the current formula.
 * Fast enough to run within Vercel's 5-min limit.
 */
export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const today = new Date().toISOString().split('T')[0];
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Get all portfolio accounts
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('user_id, account_ids')
      .in('portfolio_type', ['top_25_edge', 'top_25_sitelink', 'top_25_marine']);

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ message: 'No portfolios found' });
    }

    // Collect unique account IDs
    const accountIds = new Set<string>();
    const userIdByAccount = new Map<string, string>();
    for (const portfolio of portfolios) {
      for (const id of portfolio.account_ids) {
        accountIds.add(id);
        userIdByAccount.set(id, portfolio.user_id);
      }
    }

    console.log(`Recalculating OFI for ${accountIds.size} accounts...`);

    const results = [];
    let processed = 0;

    for (const accountId of Array.from(accountIds)) {
      const userId = userIdByAccount.get(accountId)!;

      // Get friction cards from last 90 days (include created_at for time-decay)
      const { data: frictionCards } = await supabase
        .from('friction_cards')
        .select('severity, theme_key, is_friction, created_at')
        .eq('account_id', accountId)
        .eq('is_friction', true)
        .gte('created_at', ninetyDaysAgo);

      // Get case volume (last 90 days)
      const { count: caseVolume } = await supabase
        .from('raw_inputs')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .gte('created_at', ninetyDaysAgo);

      const cards = frictionCards || [];
      const totalCases = caseVolume || 1;
      const now = Date.now();

      // Time-decay factor: cards lose weight as they age over 90 days.
      // A card created today = 1.0, a card 45 days old = ~0.5, 90 days old = ~0.1
      // Uses exponential decay: e^(-age_days / 30) so half-life ≈ 21 days
      const decayWeight = (createdAt: string) => {
        const ageDays = (now - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return Math.exp(-ageDays / 30);
      };

      // Calculate OFI with time-decay applied to severity weights
      const highSeverityCount = cards.filter(c => c.severity >= 4).length;
      const severityWeights: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };
      const weightedScore = cards.reduce((sum, card) => {
        const baseSeverity = severityWeights[card.severity] || 1;
        const decay = decayWeight(card.created_at);
        return sum + baseSeverity * decay;
      }, 0);
      const frictionDensity = (cards.length / totalCases) * 100;
      const baseScore = Math.log10(weightedScore + 1) * 15;
      const densityMultiplier = Math.min(1.5, Math.max(0.5, frictionDensity / 5));
      const highSeverityBoost = Math.min(15, highSeverityCount * 1.5);
      let ofiScore = Math.round(baseScore * densityMultiplier + highSeverityBoost);
      ofiScore = Math.min(100, Math.max(0, ofiScore));

      // Top themes
      const themeMap = new Map<string, { count: number; totalSeverity: number }>();
      cards.forEach(card => {
        const existing = themeMap.get(card.theme_key) || { count: 0, totalSeverity: 0 };
        existing.count++;
        existing.totalSeverity += card.severity;
        themeMap.set(card.theme_key, existing);
      });
      const topThemes = Array.from(themeMap.entries())
        .map(([theme_key, data]) => ({
          theme_key,
          count: data.count,
          avg_severity: data.totalSeverity / data.count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Get snapshot from ~30 days ago for trend comparison (more meaningful than yesterday)
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data: previousSnapshot } = await supabase
        .from('account_snapshots')
        .select('ofi_score')
        .eq('account_id', accountId)
        .lte('snapshot_date', thirtyDaysAgo)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      let trendVsPriorPeriod = null;
      let trendDirection: 'improving' | 'stable' | 'worsening' = 'stable';
      if (previousSnapshot && previousSnapshot.ofi_score !== null) {
        trendVsPriorPeriod = ofiScore - previousSnapshot.ofi_score;
        if (trendVsPriorPeriod > 3) trendDirection = 'worsening';
        else if (trendVsPriorPeriod < -3) trendDirection = 'improving';
      }

      // Delete existing snapshot for today and insert fresh one
      await supabase
        .from('account_snapshots')
        .delete()
        .eq('account_id', accountId)
        .eq('snapshot_date', today);

      const { error: insertError } = await supabase
        .from('account_snapshots')
        .insert({
          account_id: accountId,
          snapshot_date: today,
          ofi_score: ofiScore,
          friction_card_count: cards.length,
          high_severity_count: highSeverityCount,
          case_volume: caseVolume || 0,
          top_themes: topThemes,
          score_breakdown: {
            base_score: Math.round(baseScore * 10) / 10,
            friction_density: Math.round(frictionDensity * 10) / 10,
            density_multiplier: Math.round(densityMultiplier * 100) / 100,
            high_severity_boost: highSeverityBoost,
            severity_weighted: weightedScore,
            card_count: cards.length,
            window_days: 90,
          },
          trend_vs_prior_period: trendVsPriorPeriod,
          trend_direction: trendDirection,
        });

      if (insertError) {
        console.error(`Error saving snapshot for ${accountId}:`, insertError.message);
        results.push({ accountId, status: 'error', error: insertError.message });
      } else {
        results.push({ accountId, ofi: ofiScore, cards: cards.length, trend: trendDirection });
        processed++;
      }
    }

    console.log(`Recalculation complete: ${processed}/${accountIds.size} accounts updated`);

    return NextResponse.json({
      success: true,
      processed,
      total: accountIds.size,
      results,
    });

  } catch (error) {
    console.error('Recalculate OFI error:', error);
    return NextResponse.json({
      error: 'Recalculation failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
