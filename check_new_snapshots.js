const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSnapshots() {
  const newAccountIds = [
    '8e56bbe1-8c27-4ed2-ac03-9652c056ba3d', // Spartan
    '9626e0ff-9c16-49ee-842b-d8cc274a61f2', // 10 Federal
    '283314b6-8b69-4e1f-8948-d19db71acd5a', // West Coast
    '40c86618-4cfa-44c0-9afd-af8b6cbc1d2f', // TnT
    '5155329f-b5b6-44b1-aecc-3b5614406333'  // New Crescendo
  ];

  const { data, error } = await supabase
    .from('account_snapshots')
    .select('account_id, ofi_score, snapshot_date')
    .in('account_id', newAccountIds)
    .eq('snapshot_date', '2026-01-24');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nNew snapshots created:', data.length);
  data.forEach(s => console.log(`- Account: ${s.account_id}, OFI: ${s.ofi_score}`));
  
  // Also check total unique accounts with snapshots today
  const { data: allSnapshots } = await supabase
    .from('account_snapshots')
    .select('account_id')
    .eq('snapshot_date', '2026-01-24');
  
  const unique = new Set(allSnapshots.map(s => s.account_id));
  console.log(`\nTotal accounts with snapshots today: ${unique.size}`);
}

checkSnapshots();
