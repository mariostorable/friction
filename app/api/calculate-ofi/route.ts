import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

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

    // Get Vitally data for this account
    const { data: vitallyData } = await supabase
      .from('vitally_accounts')
      .select('health_score, nps_score, status')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single();

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: recentCards } = await supabase
      .from('friction_cards')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .eq('is_friction', true) // Only count real friction in OFI score
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

    // Count high-severity issues (severity 4 or 5)
    const highSeverityCount = recentCards.filter(c => c.severity >= 4).length;

    // Get Jira ticket status for friction themes to adjust scoring
    const themeKeys = Array.from(new Set(recentCards.map(c => c.theme_key)));

    const { data: jiraLinks } = await supabase
      .from('theme_jira_links')
      .select(`
        theme_key,
        jira_issues!inner(
          status,
          resolution_date
        )
      `)
      .in('theme_key', themeKeys)
      .eq('jira_issues.user_id', user.id);

    // Build map of theme -> best ticket status (resolved > in_progress > open)
    const themeStatus: Record<string, 'resolved' | 'in_progress' | 'open'> = {};

    jiraLinks?.forEach((link: any) => {
      const theme = link.theme_key;
      const ticket = link.jira_issues;

      if (ticket.resolution_date) {
        themeStatus[theme] = 'resolved'; // Best status
      } else if (!themeStatus[theme] || themeStatus[theme] === 'open') {
        const statusLower = ticket.status?.toLowerCase() || '';
        if (statusLower.includes('progress') || statusLower.includes('development') || statusLower.includes('review')) {
          themeStatus[theme] = 'in_progress';
        } else if (!themeStatus[theme]) {
          themeStatus[theme] = 'open';
        }
      }
    });

    // Calculate OFI Score with improved algorithm
    // Severity weights: reduced from exponential to prevent easy maxing out
    // Old: 1, 2, 4, 8, 16 -> New: 1, 2, 3, 5, 8 (still emphasizes high severity but more gradual)
    const severityWeights = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };

    // Jira adjustment multipliers (reduce score if issue is being addressed)
    const jiraMultipliers = {
      'resolved': 0.2,    // Issue fixed - only 20% of friction weight
      'in_progress': 0.5, // Being worked on - 50% of friction weight
      'open': 1.0         // Not addressed yet - full weight
    };

    // Calculate weighted friction score with Jira adjustments
    const weightedScore = recentCards.reduce((sum, card) => {
      const baseWeight = severityWeights[card.severity as keyof typeof severityWeights] || 1;
      const jiraStatus = themeStatus[card.theme_key] || 'open';
      const jiraMultiplier = jiraMultipliers[jiraStatus];
      return sum + (baseWeight * jiraMultiplier);
    }, 0);

    // Normalize by case volume to get friction density
    // Accounts with more cases should be judged on friction per case, not total friction
    const totalCases = caseVolume || 1;
    const frictionDensity = (recentCards.length / totalCases) * 100; // What % of cases had friction?

    // Base score from weighted severity (use logarithmic scale to prevent easy cap-out)
    // Reduced coefficient from 20 to 15 for better distribution
    // New scaling: 10 -> 17, 50 -> 30, 100 -> 35, 200 -> 41, 400 -> 48
    const baseScore = Math.log10(weightedScore + 1) * 15;

    // Friction density multiplier (0.5x to 1.5x based on % of cases with friction)
    // Reduced max from 2x to 1.5x to prevent excessive inflation
    // If 5% of cases have friction = normal (1x)
    // If 1% = healthy (0.5x), if 10%+ = concerning (1.5x)
    const densityMultiplier = Math.min(1.5, Math.max(0.5, frictionDensity / 5));

    // High severity count boost (each high-severity issue adds 1.5 points, capped at +15)
    // Reduced from 2 points/+20 cap to 1.5 points/+15 cap
    const highSeverityBoost = Math.min(15, highSeverityCount * 1.5);

    // Vitally health multipliers (amplify friction for at-risk accounts)
    let vitallyMultiplier = 1.0;
    let vitallyExplanation = '';

    if (vitallyData) {
      const healthScore = vitallyData.health_score;
      const npsScore = vitallyData.nps_score;
      const status = vitallyData.status?.toLowerCase();

      // Status-based amplification (highest priority)
      if (status === 'churning' || status === 'at risk' || status === 'at-risk') {
        vitallyMultiplier *= 1.3;
        vitallyExplanation = `Account marked as ${status} in Vitally (+30% friction weight)`;
      } else if (healthScore !== null && healthScore < 60) {
        // Low health score amplification
        vitallyMultiplier *= 1.2;
        vitallyExplanation = `Low customer health score (${Math.round(healthScore)}/100) (+20% friction weight)`;
      }

      // NPS detractor amplification (stacks with status)
      if (npsScore !== null && npsScore < 7) {
        vitallyMultiplier *= 1.15;
        vitallyExplanation += vitallyExplanation ? '; ' : '';
        vitallyExplanation += `Detractor NPS (${npsScore}/10) (+15% friction weight)`;
      }
    }

    // Final OFI Score calculation with Vitally amplification
    let ofiScore = Math.round((baseScore * densityMultiplier + highSeverityBoost) * vitallyMultiplier);

    // Apply ceiling at 100
    ofiScore = Math.min(100, Math.max(0, ofiScore));

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

    // Log OFI calculation details for debugging
    console.log(`OFI Calculation for account ${accountId}:`, {
      recentCards: recentCards.length,
      highSeverityCount,
      totalCases: caseVolume,
      weightedScore,
      baseScore,
      frictionDensity: frictionDensity.toFixed(2) + '%',
      densityMultiplier: densityMultiplier.toFixed(2),
      highSeverityBoost,
      vitallyMultiplier: vitallyMultiplier.toFixed(2),
      vitallyExplanation: vitallyExplanation || 'No Vitally amplification',
      finalOfiScore: ofiScore
    });

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
          base_score: baseScore,
          friction_density: frictionDensity,
          density_multiplier: densityMultiplier,
          high_severity_boost: highSeverityBoost,
          vitally_multiplier: vitallyMultiplier,
          vitally_explanation: vitallyExplanation || null,
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
