const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRemaining() {
  const today = new Date().toISOString().split('T')[0];

  // Get both portfolios
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('user_id, account_ids')
    .eq('portfolio_type', 'top_25');

  console.log(`\nAnalyzing ${portfolios.length} portfolios:`);

  for (const portfolio of portfolios) {
    console.log(`\nUser: ${portfolio.user_id}`);

    // Get accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, salesforce_id')
      .in('id', portfolio.account_ids);

    // Get snapshots for these accounts
    const { data: snapshots } = await supabase
      .from('account_snapshots')
      .select('account_id')
      .in('account_id', portfolio.account_ids)
      .eq('snapshot_date', today);

    const snapshotAccountIds = new Set(snapshots.map(s => s.account_id));
    const accountsWithoutSnapshots = accounts.filter(a => !snapshotAccountIds.has(a.id));

    console.log(`- Accounts with snapshots: ${snapshotAccountIds.size}/25`);
    console.log(`- Accounts without snapshots: ${accountsWithoutSnapshots.length}`);

    if (accountsWithoutSnapshots.length > 0) {
      console.log('\nAccounts needing analysis:');
      accountsWithoutSnapshots.forEach(a => {
        console.log(`  - ${a.name}`);
      });
    }
  }
}

checkRemaining();
