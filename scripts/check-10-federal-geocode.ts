import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: profiles } = await supabase.from('profiles').select('id').limit(1).single();

  const { data: accounts } = await supabase.rpc('get_accounts_needing_geocoding', {
    p_user_id: profiles!.id,
    p_limit: 100,
  });

  const federal = accounts?.filter((a: any) => a.name.includes('10 Federal'));
  console.log('Found', federal?.length || 0, '10 Federal Storage accounts needing geocoding:');
  federal?.forEach((acc: any) => {
    console.log(acc.name);
    console.log('  Property:', acc.property_address_city, acc.property_address_state);
    console.log('  Billing:', acc.billing_address_city, acc.billing_address_state);
  });

  if (!federal || federal.length === 0) {
    console.log('\n10 Federal Storage not in list. Checking account directly...');
    const { data: check } = await supabase.from('accounts')
      .select('name, property_address_city, property_address_state, billing_address_city, billing_address_state, latitude, longitude, status, arr')
      .ilike('name', '%10 Federal%')
      .single();
    console.log('Direct check:', JSON.stringify(check, null, 2));
  }
}

check().catch(console.error);
