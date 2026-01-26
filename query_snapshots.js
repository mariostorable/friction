const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function querySnapshots() {
  try {
    const { data, error } = await supabase
      .from('account_snapshots')
      .select('account_id', { count: 'exact' })
      .eq('snapshot_date', '2026-01-24');

    if (error) {
      console.error('Error querying database:', error);
      process.exit(1);
    }

    // Count distinct account_ids
    const uniqueAccounts = new Set(data.map(row => row.account_id));
    
    console.log('\n=== Query Results ===');
    console.log(`Date: 2026-01-24`);
    console.log(`Total snapshots: ${data.length}`);
    console.log(`Accounts with snapshots: ${uniqueAccounts.size}`);
    console.log('====================\n');
    
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

querySnapshots();
