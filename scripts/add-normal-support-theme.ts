/**
 * Add "normal_support" theme for non-friction cases
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

async function main() {
  console.log('🔄 Adding "normal_support" theme...\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('themes')
    .upsert({
      theme_key: 'normal_support',
      label: 'Normal Support',
      description: 'Routine support requests that are not product friction (how-to questions, transactional requests, onboarding tasks)',
      category: 'process',
      severity_weight: 0, // Don't count toward OFI score
      is_active: true
    }, {
      onConflict: 'theme_key'
    })
    .select();

  if (error) {
    console.error('❌ Failed to add theme:', error.message);
    return;
  }

  console.log('✅ Successfully added "normal_support" theme');
  console.log('Details:', data);
  console.log('\nThis theme will be used for:');
  console.log('  - Auto-replies and out-of-office messages');
  console.log('  - Transactional requests (change email, update address)');
  console.log('  - Onboarding tasks (add location, setup user)');
  console.log('  - Simple how-to questions');
  console.log('  - Account management requests\n');
}

main().catch(console.error);
