import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Run this script with: npx tsx scripts/diagnose-data.ts

async function diagnose() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing environment variables:');
    console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
    console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseKey);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n=== DIAGNOSTICS ===\n');

  // Check favorites
  console.log('1. Checking favorites...');
  const { data: favorites, error: favError } = await supabase
    .from('favorites')
    .select('id, user_id, account_id, created_at')
    .order('created_at', { ascending: false });

  if (favError) {
    console.error('Error fetching favorites:', favError);
  } else {
    console.log(`   Found ${favorites?.length || 0} favorites`);
    if (favorites && favorites.length > 0) {
      console.log('   Sample:', favorites.slice(0, 3));
    }
  }

  // Check account snapshots
  console.log('\n2. Checking snapshots...');
  const { data: snapshots, error: snapError } = await supabase
    .from('account_snapshots')
    .select(`
      id,
      account_id,
      snapshot_date,
      ofi_score,
      case_volume,
      trend_direction,
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  if (snapError) {
    console.error('Error fetching snapshots:', snapError);
  } else {
    console.log(`   Found ${snapshots?.length || 0} snapshots`);
    if (snapshots && snapshots.length > 0) {
      console.log('   Recent snapshots:');
      snapshots.forEach(s => {
        console.log(`     - ${s.snapshot_date}: Account ${s.account_id.substring(0, 8)}... OFI ${s.ofi_score}, Cases: ${s.case_volume || 'N/A'}, Trend: ${s.trend_direction || 'none'}`);
      });
    }
  }

  // Check snapshot count per account
  console.log('\n3. Checking snapshot history per account...');
  const { data: accounts, error: accError } = await supabase
    .from('accounts')
    .select('id, name')
    .limit(25);

  if (!accError && accounts) {
    for (const account of accounts) {
      const { data: accountSnapshots } = await supabase
        .from('account_snapshots')
        .select('snapshot_date, ofi_score')
        .eq('account_id', account.id)
        .order('snapshot_date', { ascending: false });

      if (accountSnapshots && accountSnapshots.length > 0) {
        console.log(`   ${account.name}: ${accountSnapshots.length} snapshot(s)`);
        if (accountSnapshots.length > 1) {
          console.log(`     Dates: ${accountSnapshots.map(s => s.snapshot_date).join(', ')}`);
        }
      }
    }
  }

  // Check friction cards
  console.log('\n4. Checking friction cards...');
  const { data: cards, error: cardsError } = await supabase
    .from('friction_cards')
    .select('id, account_id, created_at, severity')
    .order('created_at', { ascending: false })
    .limit(10);

  if (cardsError) {
    console.error('Error fetching friction cards:', cardsError);
  } else {
    console.log(`   Found ${cards?.length || 0} friction cards`);
    if (cards && cards.length > 0) {
      console.log('   Recent cards:', cards.slice(0, 3).map(c => ({
        created: new Date(c.created_at).toLocaleDateString(),
        severity: c.severity
      })));
    }
  }

  // Check raw inputs
  console.log('\n5. Checking raw inputs...');
  const { data: inputs, error: inputsError } = await supabase
    .from('raw_inputs')
    .select('id, account_id, processed, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (inputsError) {
    console.error('Error fetching raw inputs:', inputsError);
  } else {
    console.log(`   Found ${inputs?.length || 0} raw inputs`);
    console.log(`   Unprocessed: ${inputs?.filter(i => !i.processed).length || 0}`);
  }

  console.log('\n=== END DIAGNOSTICS ===\n');
}

diagnose().catch(console.error);
