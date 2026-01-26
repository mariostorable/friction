import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testIncrementalSync() {
  console.log('\n🧪 TESTING INCREMENTAL SYNC & THEME CLASSIFICATION\n');
  console.log('='.repeat(60));

  // Get user
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const userId = users?.[0]?.id;

  if (!userId) {
    console.error('❌ No user found');
    return;
  }

  // Get a test account (pick one with salesforce_id)
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name, salesforce_id')
    .eq('user_id', userId)
    .not('salesforce_id', 'is', null)
    .limit(1)
    .single();

  if (!account) {
    console.error('❌ No account with Salesforce ID found');
    return;
  }

  console.log(`\n📊 Test Account: ${account.name}`);
  console.log(`Account ID: ${account.id}`);
  console.log(`Salesforce ID: ${account.salesforce_id}`);

  // Check current state BEFORE sync
  const { data: casesBefore, count: casesCountBefore } = await supabase
    .from('raw_inputs')
    .select('id, created_at, metadata', { count: 'exact' })
    .eq('account_id', account.id)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const { data: cardsBefore, count: cardsCountBefore } = await supabase
    .from('friction_cards')
    .select('id, theme_key', { count: 'exact' })
    .eq('account_id', account.id)
    .eq('user_id', userId);

  console.log('\n📋 STATE BEFORE SYNC:');
  console.log(`  Cases in DB: ${casesCountBefore || 0}`);
  console.log(`  Friction cards: ${cardsCountBefore || 0}`);

  if (casesBefore && casesBefore.length > 0) {
    const latestCase = casesBefore[0];
    console.log(`  Latest case date: ${latestCase.metadata?.created_date || 'Unknown'}`);
    console.log(`  Is First Sync: NO (incremental sync will happen)`);
  } else {
    console.log(`  Is First Sync: YES (full 90-day sync will happen)`);
  }

  // Show theme distribution before
  if (cardsBefore && cardsBefore.length > 0) {
    const themeCounts: Record<string, number> = {};
    cardsBefore.forEach(card => {
      themeCounts[card.theme_key] = (themeCounts[card.theme_key] || 0) + 1;
    });

    console.log('\n  Theme Distribution Before:');
    Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([theme, count]) => {
        const pct = ((count / cardsBefore.length) * 100).toFixed(1);
        console.log(`    ${theme}: ${count} (${pct}%)`);
      });
  }

  console.log('\n🔄 RUN THE SYNC NOW:');
  console.log(`   1. Go to: https://friction-intelligence.vercel.app/account/${account.id}`);
  console.log(`   2. Click "Analyze Friction" button`);
  console.log(`   3. Wait for completion`);
  console.log(`   4. Come back and press Enter to verify results\n`);

  // Wait for user to run the sync
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // Check state AFTER sync
  console.log('\n🔍 CHECKING RESULTS...\n');

  const { data: casesAfter, count: casesCountAfter } = await supabase
    .from('raw_inputs')
    .select('id, created_at, metadata', { count: 'exact' })
    .eq('account_id', account.id)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const { data: cardsAfter, count: cardsCountAfter } = await supabase
    .from('friction_cards')
    .select('id, theme_key, severity, created_at', { count: 'exact' })
    .eq('account_id', account.id)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  console.log('✅ STATE AFTER SYNC:');
  console.log(`  Cases in DB: ${casesCountAfter || 0} (was ${casesCountBefore || 0})`);
  console.log(`  Friction cards: ${cardsCountAfter || 0} (was ${cardsCountBefore || 0})`);

  const newCases = (casesCountAfter || 0) - (casesCountBefore || 0);
  const newCards = (cardsCountAfter || 0) - (cardsCountBefore || 0);

  if (newCases > 0) {
    console.log(`  ✨ Added ${newCases} new cases (incremental sync worked!)`);
  } else if (newCases === 0 && casesCountAfter! > 0) {
    console.log(`  ✅ No new cases since last sync (incremental check working!)`);
  } else if (casesCountAfter! > 0) {
    console.log(`  ✅ Full sync completed with ${casesCountAfter} cases`);
  }

  if (newCards > 0) {
    console.log(`  ✨ Created ${newCards} new friction cards`);
  }

  // Show theme distribution after
  if (cardsAfter && cardsAfter.length > 0) {
    const themeCounts: Record<string, number> = {};
    cardsAfter.forEach(card => {
      themeCounts[card.theme_key] = (themeCounts[card.theme_key] || 0) + 1;
    });

    console.log('\n  📊 Theme Distribution After:');
    Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([theme, count]) => {
        const pct = ((count / cardsAfter.length) * 100).toFixed(1);
        const indicator = theme === 'other' ? '⚠️ ' : '✅';
        console.log(`    ${indicator} ${theme}: ${count} (${pct}%)`);
      });

    const otherCount = themeCounts['other'] || 0;
    const otherPct = ((otherCount / cardsAfter.length) * 100).toFixed(1);

    if (parseFloat(otherPct) > 20) {
      console.log(`\n  ⚠️  WARNING: ${otherPct}% are still classified as "other"`);
      console.log(`     This is high - consider reviewing case content or adding more themes`);
    } else {
      console.log(`\n  ✅ Only ${otherPct}% classified as "other" - good classification!`);
    }

    // Show most recent cards with new themes
    const recentNewThemes = cardsAfter
      .filter(c => !['billing_confusion', 'integration_failures', 'ui_confusion', 'performance_issues',
                     'missing_features', 'training_gaps', 'support_response_time', 'other'].includes(c.theme_key))
      .slice(0, 5);

    if (recentNewThemes.length > 0) {
      console.log('\n  🎉 NEW THEME CLASSIFICATIONS DETECTED:');
      recentNewThemes.forEach(card => {
        console.log(`    • ${card.theme_key} (severity: ${card.severity})`);
      });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ TEST COMPLETE!\n');

  // Test again instructions
  console.log('💡 TO TEST INCREMENTAL SYNC AGAIN:');
  console.log('   1. Wait a few minutes');
  console.log('   2. Run "Analyze Friction" again on the same account');
  console.log('   3. You should see "No new cases since last sync" OR');
  console.log('      "Incremental sync: Added X new cases"');
  console.log('   4. Old data should be preserved!\n');

  process.exit(0);
}

testIncrementalSync().catch(console.error);
