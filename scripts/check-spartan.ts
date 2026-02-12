/**
 * Check Spartan account friction analysis status
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkSpartan() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Checking Spartan account...\n');

  // Find Spartan account
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .ilike('name', '%spartan%')
    .order('arr', { ascending: false });

  if (!accounts || accounts.length === 0) {
    console.log('No Spartan accounts found');
    return;
  }

  console.log(`Found ${accounts.length} Spartan account(s):\n`);

  for (const account of accounts) {
    console.log(`Account: ${account.name}`);
    console.log(`  ID: ${account.id}`);
    console.log(`  ARR: $${account.arr?.toLocaleString() || '0'}`);
    console.log(`  OFI Score: ${account.ofi_score || 'NULL'}`);
    console.log(`  Friction Analyzed At: ${account.friction_analyzed_at || 'NULL'}`);
    console.log(`  Last Synced: ${account.last_synced_at || 'NULL'}`);
    console.log(`  Products: ${account.products || 'NULL'}`);
    console.log(`  Vertical: ${account.vertical}`);
    console.log('');

    // Check if it's in any portfolios
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('name, portfolio_type')
      .contains('account_ids', [account.id]);

    if (portfolios && portfolios.length > 0) {
      console.log('  In portfolios:');
      portfolios.forEach(p => console.log(`    - ${p.name} (${p.portfolio_type})`));
    } else {
      console.log('  ⚠️ Not in any portfolios (this is why it has no friction score!)');
    }
    console.log('');
  }
}

checkSpartan().catch(console.error);
