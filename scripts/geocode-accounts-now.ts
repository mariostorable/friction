/**
 * Geocode accounts directly using Google Maps API
 * This script bypasses the web server and directly updates the database
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function geocodeAccounts() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey || !mapsApiKey) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Get first user
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1).single();

  if (!profiles) {
    console.error('No user found');
    process.exit(1);
  }

  console.log('Fetching accounts needing geocoding...\n');

  // Get accounts needing geocoding
  const { data: accountsToGeocode, error: queryError } = await supabase.rpc(
    'get_accounts_needing_geocoding',
    {
      p_user_id: profiles.id,
      p_limit: 100,
    }
  );

  if (queryError) {
    console.error('Database error:', queryError);
    process.exit(1);
  }

  if (!accountsToGeocode || accountsToGeocode.length === 0) {
    console.log('✓ All accounts with addresses are already geocoded!');
    process.exit(0);
  }

  console.log(`Found ${accountsToGeocode.length} accounts to geocode\n`);

  let geocoded = 0;
  let failed = 0;

  for (const account of accountsToGeocode) {
    // Build address string (prefer property address)
    const addressComponents: string[] = [];

    if (account.property_address_street) addressComponents.push(account.property_address_street);
    if (account.property_address_city) addressComponents.push(account.property_address_city);
    if (account.property_address_state) addressComponents.push(account.property_address_state);
    if (account.property_address_postal_code) addressComponents.push(account.property_address_postal_code);
    if (account.property_address_country) addressComponents.push(account.property_address_country);

    // Fallback to billing address if no property address
    if (addressComponents.length === 0) {
      if (account.billing_address_street) addressComponents.push(account.billing_address_street);
      if (account.billing_address_city) addressComponents.push(account.billing_address_city);
      if (account.billing_address_state) addressComponents.push(account.billing_address_state);
      if (account.billing_address_postal_code) addressComponents.push(account.billing_address_postal_code);
      if (account.billing_address_country) addressComponents.push(account.billing_address_country);
    }

    if (addressComponents.length === 0) {
      console.log(`✗ ${account.name}: No address components`);
      failed++;
      continue;
    }

    const address = addressComponents.join(', ');

    try {
      // Call Google Maps Geocoding API
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address
      )}&key=${mapsApiKey}`;

      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      if (geocodeData.status === 'OK' && geocodeData.results[0]) {
        const result = geocodeData.results[0];
        const location = result.geometry.location;

        // Determine quality based on location_type
        let quality: 'high' | 'medium' | 'low' = 'medium';
        if (result.geometry.location_type === 'ROOFTOP') {
          quality = 'high';
        } else if (
          result.geometry.location_type === 'RANGE_INTERPOLATED' ||
          result.geometry.location_type === 'GEOMETRIC_CENTER'
        ) {
          quality = 'medium';
        } else {
          quality = 'low';
        }

        // Update account
        const { error: updateError } = await supabase
          .from('accounts')
          .update({
            latitude: location.lat,
            longitude: location.lng,
            geocode_source: 'google',
            geocode_quality: quality,
            geocoded_at: new Date().toISOString(),
          })
          .eq('id', account.id);

        if (updateError) {
          console.log(`✗ ${account.name}: Database update failed - ${updateError.message}`);
          failed++;
        } else {
          geocoded++;
          console.log(`✓ ${account.name}`);
          console.log(`  Address: ${address}`);
          console.log(`  Coords: ${location.lat}, ${location.lng} (${quality} quality)`);
          console.log('');
        }
      } else {
        console.log(`✗ ${account.name}: Geocoding failed - ${geocodeData.status}`);
        if (geocodeData.error_message) {
          console.log(`  Error: ${geocodeData.error_message}`);
        }
        console.log(`  Address: ${address}`);
        console.log('');
        failed++;
      }

      // Rate limit: 50 requests per second max for Google Maps
      // Add small delay to be safe
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.log(`✗ ${account.name}: Exception - ${error instanceof Error ? error.message : 'Unknown'}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('GEOCODING COMPLETE');
  console.log('='.repeat(80));
  console.log(`✓ Successfully geocoded: ${geocoded}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`  Total processed: ${accountsToGeocode.length}`);
  console.log('\nVisit Planner is now ready to use!');
}

geocodeAccounts().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
