/**
 * Test Visit Planner function
 * Run with: npx tsx scripts/test-visit-planner.ts
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

async function testVisitPlanner() {
  try {
    console.log('Testing Visit Planner...\n');

    // 1. Check how many accounts have geocoded addresses
    console.log('1. Checking accounts with geocoded addresses...');
    const { data: geocodedAccounts, error: geoError } = await supabase
      .from('accounts')
      .select('id, name, latitude, longitude, arr, status')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .eq('status', 'active');

    if (geoError) {
      console.error('Error fetching accounts:', geoError);
      return;
    }

    console.log(`   ✓ Found ${geocodedAccounts?.length || 0} active accounts with coordinates`);

    if (geocodedAccounts && geocodedAccounts.length > 0) {
      const withArr = geocodedAccounts.filter(a => a.arr && a.arr > 0);
      console.log(`   ✓ ${withArr.length} of those have ARR > 0`);

      // Show first few
      console.log('\n   Sample accounts:');
      geocodedAccounts.slice(0, 5).forEach(a => {
        console.log(`   - ${a.name}: (${a.latitude}, ${a.longitude}), ARR: $${a.arr?.toLocaleString() || 0}`);
      });
    }

    if (!geocodedAccounts || geocodedAccounts.length === 0) {
      console.log('\n❌ No accounts have geocoded addresses!');
      console.log('   Run the geocoding script to add coordinates to your accounts.');
      return;
    }

    // 2. Test the find_nearby_accounts function with a known location
    console.log('\n2. Testing find_nearby_accounts function...');

    // Use Austin, TX as test location (30.2672, -97.7431)
    console.log('   Testing with Austin, TX (30.2672, -97.7431), 50 mile radius...');

    const { data: nearbyAccounts, error: nearbyError } = await supabase.rpc('find_nearby_accounts', {
      p_latitude: 30.2672,
      p_longitude: -97.7431,
      p_radius_miles: 50,
      p_user_id: null,
      p_vertical: null,
      p_min_arr: 0
    });

    if (nearbyError) {
      console.error('   ❌ Error calling function:', nearbyError);
      return;
    }

    console.log(`   ✓ Function returned ${nearbyAccounts?.length || 0} accounts`);

    if (nearbyAccounts && nearbyAccounts.length > 0) {
      console.log('\n   Top 5 results:');
      nearbyAccounts.slice(0, 5).forEach((a: any) => {
        console.log(`   - ${a.name}: ${a.distance_miles} miles, OFI: ${a.ofi_score}, ARR: $${a.arr?.toLocaleString() || 0}`);
      });
    }

    // 3. Try a wider search (100 miles)
    console.log('\n3. Testing with wider radius (100 miles)...');

    const { data: widerSearch, error: widerError } = await supabase.rpc('find_nearby_accounts', {
      p_latitude: 30.2672,
      p_longitude: -97.7431,
      p_radius_miles: 100,
      p_user_id: null,
      p_vertical: null,
      p_min_arr: 0
    });

    if (widerError) {
      console.error('   ❌ Error:', widerError);
    } else {
      console.log(`   ✓ Found ${widerSearch?.length || 0} accounts within 100 miles`);
    }

    // 4. Test with center of US
    console.log('\n4. Testing with center of US (Kansas)...');
    const { data: kansasSearch, error: kansasError } = await supabase.rpc('find_nearby_accounts', {
      p_latitude: 39.8283,
      p_longitude: -98.5795,
      p_radius_miles: 200,
      p_user_id: null,
      p_vertical: null,
      p_min_arr: 0
    });

    if (kansasError) {
      console.error('   ❌ Error:', kansasError);
    } else {
      console.log(`   ✓ Found ${kansasSearch?.length || 0} accounts within 200 miles of Kansas`);
    }

    console.log('\n✓ Test complete');
    console.log('\nDiagnosis:');
    if (!geocodedAccounts || geocodedAccounts.length === 0) {
      console.log('- No accounts have coordinates. Run geocoding script.');
    } else if (!nearbyAccounts || nearbyAccounts.length === 0) {
      console.log('- Accounts have coordinates but search returned nothing.');
      console.log('- This could mean accounts are far from the test location (Austin).');
      console.log('- Try searching from a location where you know accounts exist.');
    } else {
      console.log('- Visit Planner function is working correctly!');
      console.log('- If you see "No accounts found" in the UI, the search location may not have nearby accounts.');
    }

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

testVisitPlanner();
