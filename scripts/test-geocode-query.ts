/**
 * Test the get_accounts_needing_geocoding query
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testQuery() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Get user ID first
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .limit(1)
    .single();

  if (!profiles) {
    console.error('No profiles found');
    process.exit(1);
  }

  console.log('Testing get_accounts_needing_geocoding for user:', profiles.id);

  const { data: accounts, error } = await supabase.rpc('get_accounts_needing_geocoding', {
    p_user_id: profiles.id,
    p_limit: 10,
  });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log(`\nFound ${accounts?.length || 0} accounts needing geocoding:\n`);

  accounts?.forEach((acc: any, i: number) => {
    console.log(`${i + 1}. ${acc.name}`);
    console.log(`   Property: ${acc.property_address_street || '(none)'}, ${acc.property_address_city || '(none)'}, ${acc.property_address_state || '(none)'}`);
    console.log(`   Billing: ${acc.billing_address_street || '(none)'}, ${acc.billing_address_city || '(none)'}, ${acc.billing_address_state || '(none)'}`);
    console.log('');
  });
}

testQuery().catch(console.error);
