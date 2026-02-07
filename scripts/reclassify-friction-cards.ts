/**
 * Re-classify existing friction cards
 *
 * This script:
 * 1. First run: Sets is_friction=true for all existing cards (they were already filtered during analysis)
 * 2. Optionally: Re-analyzes "other" theme cards to better categorize them
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

async function main() {
  console.log('🔍 Re-classifying friction cards...\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Step 1: Set is_friction=true for all existing cards
  // (They were already filtered during initial analysis, so they're all friction)
  console.log('Step 1: Setting is_friction=true for all existing cards...');

  const { data: updated, error: updateError } = await supabase
    .from('friction_cards')
    .update({ is_friction: true })
    .is('is_friction', null)
    .select('id');

  if (updateError) {
    console.error('❌ Error updating cards:', updateError.message);
    return;
  }

  console.log(`✅ Updated ${updated?.length || 0} cards to is_friction=true\n`);

  // Step 2: Identify "other" cards that might be misclassified
  console.log('Step 2: Analyzing "other" theme cards...');

  const { data: otherCards, error: otherError } = await supabase
    .from('friction_cards')
    .select('id, summary, severity')
    .eq('theme_key', 'other')
    .order('created_at', { ascending: false });

  if (otherError) {
    console.error('❌ Error fetching other cards:', otherError.message);
    return;
  }

  console.log(`Found ${otherCards?.length || 0} cards with theme_key='other'\n`);

  // Identify likely non-friction patterns
  const nonFrictionPatterns = [
    /auto.*reply/i,
    /out.*of.*office/i,
    /onboard/i,
    /update.*address/i,
    /change.*email/i,
    /reset.*password/i,
    /add.*location/i,
    /setup.*user/i,
    /cancel/i,
    /thank you/i,
    /received/i,
    /confirmation/i,
  ];

  const likelyNonFriction = otherCards?.filter(card =>
    nonFrictionPatterns.some(pattern => pattern.test(card.summary))
  ) || [];

  console.log(`📊 Analysis of "other" cards:`);
  console.log(`  Total: ${otherCards?.length || 0}`);
  console.log(`  Likely non-friction (auto-replies, onboarding, etc.): ${likelyNonFriction.length}`);
  console.log(`  Likely actual friction: ${(otherCards?.length || 0) - likelyNonFriction.length}\n`);

  if (likelyNonFriction.length > 0) {
    console.log('🔄 Would you like to re-classify these as non-friction?');
    console.log('Sample likely non-friction cards:');
    likelyNonFriction.slice(0, 10).forEach((card, i) => {
      console.log(`  ${i+1}. [${card.severity}] ${card.summary}`);
    });
    console.log('\nTo re-classify, run:');
    console.log(`  npx tsx scripts/mark-as-non-friction.ts --cards ${likelyNonFriction.map(c => c.id).slice(0, 10).join(',')}\n`);
  }

  // Step 3: Summary and recommendations
  console.log('📋 Summary:');
  console.log(`  ✅ All existing cards marked as is_friction=true`);
  console.log(`  📊 ${otherCards?.length || 0} cards in "other" theme need better categorization`);
  console.log(`  ⚠️  ${likelyNonFriction.length} cards are likely normal support\n`);

  console.log('💡 Next steps:');
  console.log('  1. Run analyze-friction on new cases - they will be properly classified');
  console.log('  2. Dashboard queries will need to filter by is_friction=true');
  console.log('  3. Jira linking will only create tickets for is_friction=true');
  console.log('  4. Consider re-analyzing "other" theme cards with updated prompt\n');
}

main().catch(console.error);
