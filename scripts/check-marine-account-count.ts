import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMarineCount() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  const { data: allAccounts } = await supabase
    .from('accounts')
    .select('id, name, vertical, status, arr')
    .eq('user_id', userId);

  const verticalCounts = allAccounts?.reduce((acc: any, a: any) => {
    acc[a.vertical] = acc[a.vertical] || { active: 0, inactive: 0, total: 0 };
    if (a.status === 'active') acc[a.vertical].active++;
    else acc[a.vertical].inactive++;
    acc[a.vertical].total++;
    return acc;
  }, {});

  console.log('\n=== Account Counts by Vertical ===\n');
  console.log(JSON.stringify(verticalCounts, null, 2));

  const marineAccounts = allAccounts?.filter(a => a.vertical === 'marine' && a.status === 'active');
  const storageAccounts = allAccounts?.filter(a => a.vertical === 'storage' && a.status === 'active');

  console.log(`\n\nActive marine accounts: ${marineAccounts?.length}`);
  console.log(`Active storage accounts: ${storageAccounts?.length}`);

  console.log('\n\nAll active marine accounts:');
  marineAccounts?.forEach((a, i) => {
    console.log(`${i + 1}. ${a.name} - $${a.arr?.toLocaleString() || 0}`);
  });
}

checkMarineCount().catch(console.error);
