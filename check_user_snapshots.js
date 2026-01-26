const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUserSnapshots() {
  const user1 = 'ab953672-7bad-4601-9289-5d766e73fec9';
  const user2 = '029d2fec-13fb-4ef7-a40a-6f96b3a963a5';

  // Get accounts for each user
  for (const userId of [user1, user2]) {
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('user_id', userId);

    console.log(`\nUser ${userId}:`);
    console.log(`- Total accounts: ${accounts.length}`);

    // Get snapshots for these accounts from today
    const accountIds = accounts.map(a => a.id);
    const { data: snapshots } = await supabase
      .from('account_snapshots')
      .select('account_id, ofi_score')
      .in('account_id', accountIds)
      .eq('snapshot_date', '2026-01-24');

    const uniqueAccounts = new Set(snapshots.map(s => s.account_id));
    console.log(`- Accounts with snapshots today: ${uniqueAccounts.size}`);

    if (snapshots.length > 0) {
      console.log('  Sample snapshots:');
      snapshots.slice(0, 5).forEach(s => {
        const acc = accounts.find(a => a.id === s.account_id);
        console.log(`  - ${acc?.name}: OFI ${s.ofi_score}`);
      });
    }
  }
}

checkUserSnapshots();
