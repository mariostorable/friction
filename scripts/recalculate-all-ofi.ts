import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function recalculateOFIScores() {
  try {
    console.log('🔄 Starting OFI recalculation for all accounts...\n');

    // Get all active accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, name, user_id')
      .eq('status', 'active');

    if (accountsError) {
      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      console.log('No active accounts found.');
      return;
    }

    console.log(`Found ${accounts.length} active accounts\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const account of accounts) {
      try {
        console.log(`Processing: ${account.name}...`);

        // Get recent friction cards (last 14 days)
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const { data: recentCards } = await supabase
          .from('friction_cards')
          .select('*')
          .eq('account_id', account.id)
          .eq('user_id', account.user_id)
          .gte('created_at', fourteenDaysAgo.toISOString());

        if (!recentCards || recentCards.length === 0) {
          console.log(`  ⏭️  Skipped - no friction data\n`);
          skippedCount++;
          continue;
        }

        // Get case volume
        const { count: caseVolume } = await supabase
          .from('raw_inputs')
          .select('*', { count: 'exact', head: true })
          .eq('account_id', account.id)
          .eq('user_id', account.user_id);

        // Calculate OFI using the NEW formula
        const highSeverityCount = recentCards.filter(c => c.severity >= 4).length;

        // NEW severity weights (more gradual)
        const severityWeights = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };

        const weightedScore = recentCards.reduce((sum, card) => {
          return sum + (severityWeights[card.severity as keyof typeof severityWeights] || 1);
        }, 0);

        const totalCases = caseVolume || 1;
        const frictionDensity = (recentCards.length / totalCases) * 100;

        // NEW base score coefficient (reduced from 20 to 15)
        const baseScore = Math.log10(weightedScore + 1) * 15;

        // NEW density multiplier (reduced max from 2x to 1.5x)
        const densityMultiplier = Math.min(1.5, Math.max(0.5, frictionDensity / 5));

        // NEW high severity boost (reduced from 2/20 to 1.5/15)
        const highSeverityBoost = Math.min(15, highSeverityCount * 1.5);

        let ofiScore = Math.round(baseScore * densityMultiplier + highSeverityBoost);
        ofiScore = Math.min(100, Math.max(0, ofiScore));

        // Get theme counts
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

        // Get previous snapshot for trend
        const { data: previousSnapshot } = await supabase
          .from('account_snapshots')
          .select('ofi_score')
          .eq('account_id', account.id)
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

        // Delete existing snapshot for today
        await supabase
          .from('account_snapshots')
          .delete()
          .eq('account_id', account.id)
          .eq('snapshot_date', today);

        // Insert new snapshot
        const { error: snapshotError } = await supabase
          .from('account_snapshots')
          .insert({
            account_id: account.id,
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
            },
          });

        if (snapshotError) {
          throw snapshotError;
        }

        console.log(`  ✅ OFI Score: ${ofiScore} (${trendDirection})\n`);
        successCount++;

      } catch (error) {
        console.error(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}\n`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Recalculation Summary:');
    console.log('='.repeat(50));
    console.log(`✅ Successfully recalculated: ${successCount}`);
    console.log(`⏭️  Skipped (no friction data): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📋 Total accounts processed: ${accounts.length}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

recalculateOFIScores();
