/**
 * Manually update Commonwealth Storage ARR
 * Commonwealth has $164.24 MRR in Salesforce = $1,970.88 ARR
 * It's too small to be in top 2000 sync, so we update it manually
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function fixCommonwealthARR() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Updating Commonwealth Storage ARR...\n');

  // MRR from Salesforce: $164.24
  // ARR = MRR × 12 = $1,970.88
  const correctARR = 164.24 * 12;

  const { data, error } = await supabase
    .from('accounts')
    .update({
      arr: correctARR,
      last_synced_at: new Date().toISOString()
    })
    .eq('name', 'Commonwealth Storage - CORP')
    .select();

  if (error) {
    console.error('Error updating Commonwealth:', error);
    process.exit(1);
  }

  if (data && data.length > 0) {
    console.log('✓ Successfully updated Commonwealth Storage:');
    console.log(`  ARR: $${data[0].arr?.toFixed(2)}`);
    console.log(`  Last Synced: ${data[0].last_synced_at}`);
  } else {
    console.log('✗ Commonwealth Storage not found in database');
  }
}

fixCommonwealthARR().catch(console.error);
