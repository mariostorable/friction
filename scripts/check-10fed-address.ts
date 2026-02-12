/**
 * Check 10 Federal Storage address and geocoding status
 * Run with: npx tsx scripts/check-10fed-address.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check10Fed() {
  try {
    console.log('Checking 10 Federal Storage...\n');

    // Search for 10 Federal accounts
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .ilike('name', '%10 federal%')
      .eq('status', 'active');

    if (error) {
      console.error('Error:', error);
      return;
    }

    if (!accounts || accounts.length === 0) {
      console.log('No 10 Federal Storage accounts found');
      return;
    }

    console.log(`Found ${accounts.length} 10 Federal Storage account(s):\n`);

    accounts.forEach((account, idx) => {
      console.log(`${idx + 1}. ${account.name}`);
      console.log(`   Salesforce ID: ${account.salesforce_id}`);
      console.log(`   ARR: $${account.arr?.toLocaleString() || '0'}`);
      console.log(`   Status: ${account.status}`);
      console.log('');

      console.log('   Property Address:');
      if (account.property_address_street) {
        console.log(`     Street: ${account.property_address_street}`);
      }
      if (account.property_address_city) {
        console.log(`     City: ${account.property_address_city}`);
      }
      if (account.property_address_state) {
        console.log(`     State: ${account.property_address_state}`);
      }
      if (account.property_address_postal_code) {
        console.log(`     ZIP: ${account.property_address_postal_code}`);
      }
      if (!account.property_address_street && !account.property_address_city) {
        console.log(`     (no property address)`);
      }
      console.log('');

      console.log('   Billing Address:');
      if (account.billing_address_street) {
        console.log(`     Street: ${account.billing_address_street}`);
      }
      if (account.billing_address_city) {
        console.log(`     City: ${account.billing_address_city}`);
      }
      if (account.billing_address_state) {
        console.log(`     State: ${account.billing_address_state}`);
      }
      if (account.billing_address_postal_code) {
        console.log(`     ZIP: ${account.billing_address_postal_code}`);
      }
      if (!account.billing_address_street && !account.billing_address_city) {
        console.log(`     (no billing address)`);
      }
      console.log('');

      if (account.latitude && account.longitude) {
        console.log(`   ✓ Geocoded: ${account.latitude}, ${account.longitude}`);
        console.log(`   → Should appear in Visit Planner!`);
      } else {
        console.log(`   ⚠️  NOT geocoded - missing coordinates`);

        if (account.property_address_city && account.property_address_state) {
          console.log(`   → Has address data - can be geocoded`);
          console.log(`   → Run: npx tsx scripts/geocode-accounts-now.ts`);
        } else if (account.billing_address_city && account.billing_address_state) {
          console.log(`   → Has billing address - can try geocoding from billing address`);
        } else {
          console.log(`   → Missing address data - cannot geocode`);
          console.log(`   → Update address in Salesforce and sync`);
        }
      }
      console.log('\n' + '='.repeat(80) + '\n');
    });

    // Test if we can find it near Raleigh
    if (accounts.length > 0 && accounts[0].latitude && accounts[0].longitude) {
      console.log('Testing Visit Planner query near Raleigh...\n');

      const { data: nearbyAccounts, error: nearbyError } = await supabase.rpc('find_nearby_accounts', {
        p_latitude: 35.7796,  // Raleigh, NC
        p_longitude: -78.6382,
        p_radius_miles: 50,
        p_user_id: null,
        p_vertical: null,
        p_min_arr: 0
      });

      if (nearbyError) {
        console.error('Error testing query:', nearbyError);
      } else {
        const found10Fed = nearbyAccounts?.find((a: any) => a.name.toLowerCase().includes('10 federal'));
        if (found10Fed) {
          console.log('✓ 10 Federal Storage appears in Visit Planner results!');
          console.log(`  Distance: ${found10Fed.distance_miles} miles from Raleigh`);
        } else {
          console.log('⚠️  10 Federal Storage NOT in Visit Planner results');
          console.log(`  (Found ${nearbyAccounts?.length || 0} other accounts within 50 miles)`);
        }
      }
    }

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

check10Fed();
