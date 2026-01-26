import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAccounts() {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, salesforce_id')
    .limit(5);
  
  console.log('Your accounts:');
  accounts?.forEach(acc => {
    console.log(`\nName: ${acc.name}`);
    console.log(`Account ID: ${acc.id}`);
    console.log(`Salesforce ID: ${acc.salesforce_id}`);
  });
}

getAccounts();
