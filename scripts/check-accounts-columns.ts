/**
 * Check if accounts table has ofi_score column
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkColumns() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Get one account to see what columns it has
  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .limit(1)
    .single();

  if (account) {
    console.log('Accounts table columns:');
    console.log(Object.keys(account).sort().join(', '));
    console.log('\nHas ofi_score?', 'ofi_score' in account);
  }
}

checkColumns().catch(console.error);
