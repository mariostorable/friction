import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    const salesforceIds = ['0010y00001kPeJmAAK', '001C000001HOz9tIAD'];
    const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!GOOGLE_MAPS_API_KEY) {
      return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    // Fetch accounts
    const { data: accounts, error: fetchError } = await supabase
      .from('accounts')
      .select('id, salesforce_id, name, property_address_street, property_address_city, property_address_state, property_address_postal_code')
      .in('salesforce_id', salesforceIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const results = [];

    for (const account of accounts) {
      if (!account.property_address_street) {
        results.push({ account: account.name, error: 'No address to geocode' });
        continue;
      }

      // Build full address
      const fullAddress = `${account.property_address_street}, ${account.property_address_city}, ${account.property_address_state} ${account.property_address_postal_code}`;

      // Geocode using Google Maps
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_MAPS_API_KEY}`;

      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      if (geocodeData.status !== 'OK' || !geocodeData.results || geocodeData.results.length === 0) {
        results.push({ account: account.name, error: 'Geocoding failed', details: geocodeData.status });
        continue;
      }

      const location = geocodeData.results[0].geometry.location;
      const latitude = location.lat;
      const longitude = location.lng;

      // Update account with lat/lng
      const { error: updateError } = await supabase
        .from('accounts')
        .update({
          latitude: latitude,
          longitude: longitude,
          geocode_source: 'google_maps',
          geocode_quality: 'ROOFTOP',
          geocoded_at: new Date().toISOString()
        })
        .eq('id', account.id);

      if (updateError) {
        results.push({ account: account.name, error: 'Failed to update', details: updateError });
      } else {
        results.push({
          account: account.name,
          success: true,
          address: fullAddress,
          latitude: latitude,
          longitude: longitude
        });
      }
    }

    return NextResponse.json({ results });

  } catch (error: any) {
    console.error('Error geocoding accounts:', error);
    return NextResponse.json(
      { error: 'Failed to geocode accounts', details: error.message },
      { status: 500 }
    );
  }
}
