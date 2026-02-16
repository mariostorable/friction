import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testFunction() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Testing find_nearby_accounts Function ===\n');

  // Test with Austin, TX coordinates
  const { data, error } = await supabase.rpc('find_nearby_accounts', {
    p_latitude: 30.2672,
    p_longitude: -97.7431,
    p_radius_miles: 100,
    p_user_id: userId,
    p_vertical: null,
    p_min_arr: 0,
  });

  if (error) {
    console.error('Error calling function:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No accounts found');
    return;
  }

  console.log(`Found ${data.length} accounts\n`);

  // Check first account's fields
  const firstAccount = data[0];
  console.log('First account fields:');
  console.log(JSON.stringify(firstAccount, null, 2));

  console.log('\n📋 Field Check:');
  console.log(`  ✓ name: ${!!firstAccount.name}`);
  console.log(`  ✓ property_address_city: ${!!firstAccount.property_address_city}`);
  console.log(`  ✓ property_address_state: ${!!firstAccount.property_address_state}`);
  console.log(`  ${firstAccount.property_address_street !== undefined ? '✓' : '❌'} property_address_street: ${firstAccount.property_address_street !== undefined ? 'EXISTS' : 'MISSING'}`);
  console.log(`  ${firstAccount.billing_address_street !== undefined ? '✓' : '❌'} billing_address_street: ${firstAccount.billing_address_street !== undefined ? 'EXISTS' : 'MISSING'}`);
  console.log(`  ${firstAccount.facility_count !== undefined ? '✓' : '❌'} facility_count: ${firstAccount.facility_count !== undefined ? 'EXISTS' : 'MISSING'}`);

  if (firstAccount.property_address_street === undefined) {
    console.log('\n⚠️  CONFIRMED: street address fields are missing from function output');
    console.log('   Migration is needed to add these fields to the RETURNS TABLE clause');
  }
}

testFunction().catch(console.error);
