const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const user2Accounts = [
    '8e56bbe1-8c27-4ed2-ac03-9652c056ba3d',
    '9626e0ff-9c16-49ee-842b-d8cc274a61f2',
    '283314b6-8b69-4e1f-8948-d19db71acd5a',
    '40c86618-4cfa-44c0-9afd-af8b6cbc1d2f',
    '5155329f-b5b6-44b1-aecc-3b5614406333'
  ];

  const { data, error } = await supabase
    .from('account_snapshots')
    .select('*')
    .in('account_id', user2Accounts)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nFound ${data.length} snapshots for User 2 analyzed accounts`);
  if (data.length > 0) {
    data.forEach(s => {
      console.log(`- Account: ${s.account_id.substring(0, 8)}..., Date: ${s.snapshot_date}, OFI: ${s.ofi_score}`);
    });
  } else {
    console.log('No snapshots found! This means snapshot creation failed silently.');
  }
}

check();
