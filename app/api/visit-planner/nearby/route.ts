import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { calculatePriorityScores, getMaxArr } from '@/lib/priorityScore';

export const dynamic = 'force-dynamic';

/**
 * POST /api/visit-planner/nearby
 *
 * Find accounts within a radius of a location with optional filters.
 * Returns accounts sorted by distance with priority scores calculated.
 *
 * Body Parameters:
 * - center_lat: number (required) - Latitude of center point
 * - center_lng: number (required) - Longitude of center point
 * - radius_miles: number (default: 50) - Search radius in miles
 * - filters: object (optional) - Filtering options
 *   - vertical: 'storage' | 'marine' | 'rv' | null
 *   - min_arr: number (minimum ARR in dollars)
 *   - min_friction: number (minimum OFI score 0-100)
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
    const {
      center_lat,
      center_lng,
      radius_miles = 50,
      filters = {},
    } = body;

    // Validate required parameters
    if (typeof center_lat !== 'number' || typeof center_lng !== 'number') {
      return NextResponse.json(
        { error: 'Invalid parameters', details: 'center_lat and center_lng must be numbers' },
        { status: 400 }
      );
    }

    if (center_lat < -90 || center_lat > 90 || center_lng < -180 || center_lng > 180) {
      return NextResponse.json(
        { error: 'Invalid coordinates', details: 'Latitude must be -90 to 90, longitude -180 to 180' },
        { status: 400 }
      );
    }

    // Extract filters
    const { vertical = null, min_arr = 0, min_friction = 0 } = filters;

    // Call database function to find nearby accounts
    const { data: nearbyAccounts, error: queryError } = await supabase.rpc('find_nearby_accounts', {
      p_latitude: center_lat,
      p_longitude: center_lng,
      p_radius_miles: radius_miles,
      p_user_id: user.id,
      p_vertical: vertical,
      p_min_arr: min_arr,
    });

    if (queryError) {
      console.error('Error finding nearby accounts:', queryError);
      return NextResponse.json(
        { error: 'Database error', details: queryError.message },
        { status: 500 }
      );
    }

    if (!nearbyAccounts || nearbyAccounts.length === 0) {
      return NextResponse.json({
        accounts: [],
        count: 0,
        center: { lat: center_lat, lng: center_lng },
        radius_miles,
      });
    }

    // Filter by min_friction if specified (done in application since ofi_score comes from LATERAL join)
    let filteredAccounts = nearbyAccounts;
    if (min_friction > 0) {
      filteredAccounts = nearbyAccounts.filter(
        (account: any) => (account.ofi_score || 0) >= min_friction
      );
    }

    // Calculate priority scores
    const maxArr = getMaxArr(filteredAccounts);
    const accountsWithScores = calculatePriorityScores(filteredAccounts, {
      maxDistance: radius_miles,
      maxArr,
    });

    // Sort by priority score (descending)
    const sortedAccounts = accountsWithScores.sort(
      (a, b) => b.priority_score - a.priority_score
    );

    return NextResponse.json({
      accounts: sortedAccounts,
      count: sortedAccounts.length,
      center: { lat: center_lat, lng: center_lng },
      radius_miles,
      max_arr: maxArr, // Useful for client-side debugging
    });
  } catch (error) {
    console.error('Error in nearby accounts API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
