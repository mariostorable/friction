const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const today = new Date().toISOString().split('T')[0]; // Use same logic as endpoint

  console.log(`\nQuerying for snapshots dated: ${today} (UTC)`);

  const { data: snapshots } = await supabase
    .from('account_snapshots')
    .select('account_id, ofi_score')
    .eq('snapshot_date', today);

  const uniqueAccounts = new Set(snapshots.map(s => s.account_id));
  console.log(`Total accounts with snapshots: ${uniqueAccounts.size}`);
  console.log(`Total snapshot records: ${snapshots.length}`);

  // Group by user
  const user1 = 'ab953672-7bad-4601-9289-5d766e73fec9';
  const user2 = '029d2fec-13fb-4ef7-a40a-6f96b3a963a5';

  const { data: user1Accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', user1);

  const { data: user2Accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', user2);

  const user1Ids = new Set(user1Accounts.map(a => a.id));
  const user2Ids = new Set(user2Accounts.map(a => a.id));

  const user1Snapshots = snapshots.filter(s => user1Ids.has(s.account_id));
  const user2Snapshots = snapshots.filter(s => user2Ids.has(s.account_id));

  console.log(`\nUser 1 accounts with snapshots: ${new Set(user1Snapshots.map(s => s.account_id)).size}`);
  console.log(`User 2 accounts with snapshots: ${new Set(user2Snapshots.map(s => s.account_id)).size}`);
}

check();
