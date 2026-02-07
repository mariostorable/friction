/**
 * Check Analysis Progress
 * Shows how many accounts have been analyzed and are pending
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  const args = process.argv.slice(2);
  const userId = args[0];

  if (!userId) {
    console.error('Usage: npx tsx scripts/check-analysis-progress.ts <user-id>');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('📊 Checking Analysis Progress\n');

  // Check accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, salesforce_id, status')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (accountsError) {
    console.error('Error:', accountsError.message);
    process.exit(1);
  }

  console.log(`Total Active Accounts: ${accounts?.length || 0}\n`);

  // Check snapshots (today's analysis)
  const today = new Date().toISOString().split('T')[0];
  const { data: snapshots } = await supabase
    .from('account_snapshots')
    .select('account_id, ofi_score')
    .eq('snapshot_date', today);

  const analyzedToday = snapshots?.length || 0;

  console.log(`✅ Analyzed Today: ${analyzedToday}`);
  console.log(`⏳ Pending: ${(accounts?.length || 0) - analyzedToday}\n`);

  if (analyzedToday > 0) {
    console.log('📈 Sample OFI Scores:');
    const sampleSnapshots = snapshots?.slice(0, 5) || [];
    for (const snapshot of sampleSnapshots) {
      const account = accounts?.find(a => a.id === snapshot.account_id);
      console.log(`  - ${account?.name}: OFI ${snapshot.ofi_score}`);
    }
  }

  // Check portfolios
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('name, portfolio_type, account_ids')
    .eq('user_id', userId);

  console.log('\n📁 Portfolios:');
  portfolios?.forEach(p => {
    console.log(`  - ${p.name}: ${p.account_ids.length} accounts`);
  });

  console.log('');
}

main().catch(console.error);
