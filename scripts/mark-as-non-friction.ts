/**
 * Mark likely non-friction cards as is_friction=false
 *
 * This script identifies cards in the "other" theme that match non-friction patterns
 * (auto-replies, onboarding requests, etc.) and marks them as normal support.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

async function main() {
  console.log('🧹 Cleaning up non-friction cards...\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Non-friction patterns (same as in reclassify script)
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

  console.log('Step 1: Finding non-friction cards in "other" theme...');

  // Get all "other" cards
  const { data: otherCards, error: fetchError } = await supabase
    .from('friction_cards')
    .select('id, summary, severity, account_id, created_at')
    .eq('theme_key', 'other')
    .eq('is_friction', true); // Only process cards currently marked as friction

  if (fetchError) {
    console.error('❌ Error fetching cards:', fetchError.message);
    return;
  }

  console.log(`Found ${otherCards?.length || 0} cards in "other" theme\n`);

  // Filter to non-friction
  const nonFrictionCards = otherCards?.filter(card =>
    nonFrictionPatterns.some(pattern => pattern.test(card.summary))
  ) || [];

  console.log(`📊 Identified ${nonFrictionCards.length} non-friction cards\n`);

  if (nonFrictionCards.length === 0) {
    console.log('✅ No cards to update!');
    return;
  }

  // Show sample
  console.log('Sample cards to be marked as non-friction:');
  nonFrictionCards.slice(0, 10).forEach((card, i) => {
    console.log(`  ${i+1}. [severity ${card.severity}] ${card.summary.substring(0, 80)}...`);
  });
  console.log('');

  console.log('Step 2: Updating cards to is_friction=false and theme_key=normal_support...');

  // Update all non-friction cards
  const cardIds = nonFrictionCards.map(c => c.id);

  const { data: updated, error: updateError } = await supabase
    .from('friction_cards')
    .update({
      is_friction: false,
      theme_key: 'normal_support'
    })
    .in('id', cardIds)
    .select('id');

  if (updateError) {
    console.error('❌ Error updating cards:', updateError.message);
    return;
  }

  console.log(`✅ Successfully updated ${updated?.length || 0} cards to normal_support\n`);

  // Show stats
  console.log('📊 Summary:');
  console.log(`  Total "other" cards: ${otherCards?.length || 0}`);
  console.log(`  Marked as non-friction: ${updated?.length || 0}`);
  console.log(`  Remaining as friction: ${(otherCards?.length || 0) - (updated?.length || 0)}`);
  console.log('');

  console.log('✨ Cleanup complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Your dashboards will now show accurate friction counts');
  console.log('  2. OFI scores will exclude these normal support requests');
  console.log('  3. Jira sync will only link to real friction cards');
  console.log('  4. New cases will be properly classified with the stricter prompt\n');
}

main().catch(console.error);
