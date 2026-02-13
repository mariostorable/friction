import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkOFIStatus() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('status', 'active');

  const { data: snapshots } = await supabase
    .from('account_snapshots')
    .select('account_id')
    .order('snapshot_date', { ascending: false });

  const { data: frictionCards } = await supabase
    .from('friction_cards')
    .select('account_id');

  const { data: rawInputs } = await supabase
    .from('raw_inputs')
    .select('processed, account_id');

  console.log('\n=== OFI Status Check ===\n');
  console.log('Active accounts:', accounts?.length || 0);
  console.log('Accounts with snapshots:', new Set(snapshots?.map(s => s.account_id)).size || 0);
  console.log('Accounts with friction cards:', new Set(frictionCards?.map(f => f.account_id)).size || 0);
  console.log('\nRaw inputs total:', rawInputs?.length || 0);
  console.log('Raw inputs processed:', rawInputs?.filter(r => r.processed).length || 0);
  console.log('Raw inputs unprocessed:', rawInputs?.filter(r => !r.processed).length || 0);

  if (rawInputs && rawInputs.filter(r => !r.processed).length > 0) {
    console.log('\n⚠️  You have unprocessed cases that need AI analysis');
    console.log('Run: POST /api/cron/analyze-portfolio');
  }
}

checkOFIStatus().catch(console.error);
