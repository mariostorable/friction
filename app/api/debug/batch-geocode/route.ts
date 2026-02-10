import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!GOOGLE_MAPS_API_KEY) {
      return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    // Find accounts with addresses but no coordinates
    const { data: accounts, error: fetchError } = await supabase
      .from('accounts')
      .select('id, name, property_address_street, property_address_city, property_address_state, property_address_postal_code, latitude, longitude')
      .not('property_address_street', 'is', null)
      .is('latitude', null)
      .limit(limit);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        message: 'No accounts need geocoding',
        geocoded: 0
      });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const account of accounts) {
      // Build full address
      const addressParts = [
        account.property_address_street,
        account.property_address_city,
        account.property_address_state,
        account.property_address_postal_code
      ].filter(Boolean);

      const fullAddress = addressParts.join(', ');

      if (!fullAddress) {
        failCount++;
        continue;
      }

      try {
        // Geocode using Google Maps
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_MAPS_API_KEY}`;

        const geocodeResponse = await fetch(geocodeUrl);
        const geocodeData = await geocodeResponse.json();

        if (geocodeData.status !== 'OK' || !geocodeData.results || geocodeData.results.length === 0) {
          results.push({
            account: account.name,
            error: 'Geocoding failed',
            status: geocodeData.status,
            address: fullAddress
          });
          failCount++;
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
            geocode_quality: geocodeData.results[0].geometry.location_type || 'APPROXIMATE',
            geocoded_at: new Date().toISOString()
          })
          .eq('id', account.id);

        if (updateError) {
          results.push({ account: account.name, error: 'Failed to update', details: updateError });
          failCount++;
        } else {
          successCount++;
          if (results.length < 10) { // Only include first 10 in detailed results
            results.push({
              account: account.name,
              success: true,
              address: fullAddress,
              coordinates: `${latitude}, ${longitude}`
            });
          }
        }

        // Rate limit: sleep 100ms between requests to avoid hitting Google Maps API limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        results.push({ account: account.name, error: error.message });
        failCount++;
      }
    }

    return NextResponse.json({
      message: 'Batch geocoding complete',
      total_processed: accounts.length,
      successful: successCount,
      failed: failCount,
      sample_results: results.slice(0, 10)
    });

  } catch (error: any) {
    console.error('Error batch geocoding:', error);
    return NextResponse.json(
      { error: 'Failed to batch geocode', details: error.message },
      { status: 500 }
    );
  }
}
