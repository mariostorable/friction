import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRecentSyncs() {
  console.log('Checking recently synced accounts...\n');

  // Get accounts synced in last 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: recentAccounts, error } = await supabase
    .from('accounts')
    .select('id, name, arr, last_synced_at, salesforce_id')
    .gte('last_synced_at', tenMinutesAgo)
    .order('last_synced_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${recentAccounts?.length || 0} accounts synced in last 10 minutes\n`);

  if (recentAccounts && recentAccounts.length > 0) {
    console.log('First 10 accounts:');
    recentAccounts.slice(0, 10).forEach((acc, idx) => {
      console.log(`${idx + 1}. ${acc.name}`);
      console.log(`   ARR: $${acc.arr?.toLocaleString() || '0'}`);
      console.log(`   Synced: ${acc.last_synced_at}`);
      console.log('');
    });

    // Check if Commonwealth is in the list
    const commonwealth = recentAccounts.find(a => a.name.toLowerCase().includes('commonwealth'));
    if (commonwealth) {
      console.log('✓ Commonwealth WAS synced:');
      console.log(`  ARR: $${commonwealth.arr?.toLocaleString() || '0'}`);
    } else {
      console.log('✗ Commonwealth NOT in recently synced accounts');
      console.log('  This means Salesforce did not return Commonwealth in the query');
    }

    // Show some stats
    const withARR = recentAccounts.filter(a => a.arr && a.arr > 0).length;
    const withZeroARR = recentAccounts.filter(a => !a.arr || a.arr === 0).length;

    console.log('\nSync Statistics:');
    console.log(`  Total synced: ${recentAccounts.length}`);
    console.log(`  With ARR > 0: ${withARR}`);
    console.log(`  With $0 ARR: ${withZeroARR}`);
  }
}

checkRecentSyncs();
