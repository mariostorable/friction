import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/visit-planner/geocode-city
 *
 * Convert a city name to geographic coordinates using Google Maps Geocoding API.
 *
 * Body Parameters:
 * - city: string (required) - City name (e.g., "Austin")
 * - state: string (optional) - State code (e.g., "TX")
 * - country: string (default: "US") - Country code
 *
 * Returns:
 * - latitude: number
 * - longitude: number
 * - formatted_address: string
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
    const body = await request.json();
    const { city, state = '', country = 'US' } = body;

    // Validate required parameters
    if (!city || typeof city !== 'string' || city.trim().length === 0) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: 'city is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Check for API key
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured');
      return NextResponse.json(
        { error: 'Configuration error', details: 'Maps API key not configured' },
        { status: 500 }
      );
    }

    // Build address string for geocoding
    // Format: "City, State, Country"
    const addressComponents = [city.trim()];
    if (state && state.trim().length > 0) {
      addressComponents.push(state.trim());
    }
    addressComponents.push(country.trim());
    const address = addressComponents.join(', ');

    // Call Google Maps Geocoding API
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${apiKey}`;

    const geocodeResponse = await fetch(geocodeUrl);

    if (!geocodeResponse.ok) {
      console.error('Google Maps API error:', geocodeResponse.status, geocodeResponse.statusText);
      return NextResponse.json(
        {
          error: 'Geocoding service error',
          details: `HTTP ${geocodeResponse.status}: ${geocodeResponse.statusText}`,
        },
        { status: 502 }
      );
    }

    const geocodeData = await geocodeResponse.json();

    // Check for API errors
    if (geocodeData.status !== 'OK') {
      if (geocodeData.status === 'ZERO_RESULTS') {
        return NextResponse.json(
          {
            error: 'Location not found',
            details: `Could not find location for "${city}${state ? ', ' + state : ''}". Try being more specific or check spelling.`,
          },
          { status: 404 }
        );
      }

      if (geocodeData.status === 'REQUEST_DENIED') {
        console.error('Google Maps API request denied:', geocodeData.error_message);
        return NextResponse.json(
          {
            error: 'Geocoding service denied',
            details: 'API key issue or quota exceeded. Please check configuration.',
          },
          { status: 403 }
        );
      }

      console.error('Google Maps API error:', geocodeData.status, geocodeData.error_message);
      return NextResponse.json(
        {
          error: 'Geocoding failed',
          details: geocodeData.error_message || geocodeData.status,
        },
        { status: 500 }
      );
    }

    // Extract result
    const result = geocodeData.results[0];
    if (!result || !result.geometry || !result.geometry.location) {
      return NextResponse.json(
        { error: 'Invalid geocoding response', details: 'Missing location data' },
        { status: 500 }
      );
    }

    const location = result.geometry.location;

    // Return coordinates and formatted address
    return NextResponse.json({
      latitude: location.lat,
      longitude: location.lng,
      formatted_address: result.formatted_address,
      address_components: result.address_components, // Useful for extracting city, state, etc.
    });
  } catch (error) {
    console.error('Error in geocode-city API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
