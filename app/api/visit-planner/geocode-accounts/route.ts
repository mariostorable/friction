import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300; // 5 minutes for batch geocoding
export const dynamic = 'force-dynamic';

/**
 * POST /api/visit-planner/geocode-accounts
 *
 * Geocode accounts that have addresses but no coordinates using Google Maps API.
 * Processes in batches to avoid timeouts and rate limits.
 *
 * Body Parameters:
 * - limit: number (default: 50) - Max accounts to geocode in this run
 *
 * Returns:
 * - geocoded: number - Accounts successfully geocoded
 * - skipped: number - Accounts skipped (no address or already geocoded)
 * - failed: number - Accounts that failed geocoding
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { limit = 500 } = body;

    // Check for API key
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured');
      return NextResponse.json(
        { error: 'Configuration error', details: 'Maps API key not configured' },
        { status: 500 }
      );
    }

    // Get accounts needing geocoding using the helper function
    const { data: accountsToGeocode, error: queryError } = await supabase.rpc(
      'get_accounts_needing_geocoding',
      {
        p_user_id: user.id,
        p_limit: limit,
      }
    );

    if (queryError) {
      console.error('Error fetching accounts:', queryError);
      return NextResponse.json(
        { error: 'Database error', details: queryError.message },
        { status: 500 }
      );
    }

    if (!accountsToGeocode || accountsToGeocode.length === 0) {
      return NextResponse.json({
        success: true,
        geocoded: 0,
        skipped: 0,
        failed: 0,
        message: 'All accounts with addresses are already geocoded!',
      });
    }

    console.log(`Geocoding ${accountsToGeocode.length} accounts...`);

    let geocoded = 0;
    let failed = 0;
    const updates: any[] = [];

    // Process each account
    for (const account of accountsToGeocode) {
      // Build address string (prefer property address)
      const addressComponents: string[] = [];

      if (account.property_address_street) addressComponents.push(account.property_address_street);
      if (account.property_address_city) addressComponents.push(account.property_address_city);
      if (account.property_address_state) addressComponents.push(account.property_address_state);
      if (account.property_address_postal_code)
        addressComponents.push(account.property_address_postal_code);
      if (account.property_address_country) addressComponents.push(account.property_address_country);

      // Fallback to billing address if no property address
      if (addressComponents.length === 0) {
        if (account.billing_address_street) addressComponents.push(account.billing_address_street);
        if (account.billing_address_city) addressComponents.push(account.billing_address_city);
        if (account.billing_address_state) addressComponents.push(account.billing_address_state);
        if (account.billing_address_postal_code)
          addressComponents.push(account.billing_address_postal_code);
        if (account.billing_address_country) addressComponents.push(account.billing_address_country);
      }

      if (addressComponents.length === 0) {
        console.log(`Skipping ${account.name}: No address components`);
        failed++;
        continue;
      }

      const address = addressComponents.join(', ');

      try {
        // Call Google Maps Geocoding API
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          address
        )}&key=${apiKey}`;

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

          updates.push({
            id: account.id,
            latitude: location.lat,
            longitude: location.lng,
            geocode_source: 'google',
            geocode_quality: quality,
            geocoded_at: new Date().toISOString(),
          });

          geocoded++;
          console.log(`✓ Geocoded ${account.name}: ${location.lat}, ${location.lng} (${quality})`);
        } else {
          console.log(
            `Failed to geocode ${account.name}: ${geocodeData.status} - ${geocodeData.error_message || 'Unknown error'}`
          );
          failed++;
        }

        // Rate limit: 50 requests per second max for Google Maps
        // Add small delay to be safe
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error geocoding ${account.name}:`, error);
        failed++;
      }
    }

    // Batch update all geocoded accounts
    if (updates.length > 0) {
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('accounts')
          .update({
            latitude: update.latitude,
            longitude: update.longitude,
            geocode_source: update.geocode_source,
            geocode_quality: update.geocode_quality,
            geocoded_at: update.geocoded_at,
          })
          .eq('id', update.id);

        if (updateError) {
          console.error(`Failed to update account ${update.id}:`, updateError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      geocoded,
      failed,
      total_processed: accountsToGeocode.length,
      message: `Geocoded ${geocoded} accounts! ${failed > 0 ? `${failed} failed.` : ''}`,
    });
  } catch (error) {
    console.error('Error in geocode-accounts API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
