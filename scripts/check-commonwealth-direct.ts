/**
 * Check Commonwealth Storage directly in database
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCommonwealth() {
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .ilike('name', '%commonwealth%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!accounts || accounts.length === 0) {
    console.log('No Commonwealth accounts found');
    return;
  }

  console.log(`Found ${accounts.length} Commonwealth account(s):\n`);

  accounts.forEach((account, idx) => {
    console.log(`${idx + 1}. ${account.name}`);
    console.log(`   Salesforce ID: ${account.salesforce_id}`);
    console.log(`   ARR: $${account.arr?.toLocaleString() || '0'}`);
    console.log(`   Status: ${account.status}`);
    console.log(`   Last Synced: ${account.last_synced_at}`);
    console.log(`   Billing City: ${account.billing_address_city || 'NULL'}`);
    console.log(`   Billing State: ${account.billing_address_state || 'NULL'}`);
    console.log(`   Property City: ${account.property_address_city || 'NULL'}`);
    console.log(`   Property State: ${account.property_address_state || 'NULL'}`);
    console.log(`   Coordinates: ${account.latitude ? `${account.latitude}, ${account.longitude}` : 'NULL'}`);
    console.log('');
  });
}

checkCommonwealth();
