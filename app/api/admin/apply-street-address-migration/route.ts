import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * ONE-TIME MIGRATION ENDPOINT
 * Adds street address fields to find_nearby_accounts function
 *
 * Run once by visiting: http://localhost:3000/api/admin/apply-street-address-migration
 * Or in production: https://friction-intelligence.vercel.app/api/admin/apply-street-address-migration
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    console.log('Applying street address migration...');

    // Drop the existing function
    const dropSql = 'DROP FUNCTION IF EXISTS find_nearby_accounts CASCADE;';

    // Create the updated function
    const createSql = `
CREATE FUNCTION find_nearby_accounts(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_radius_miles INTEGER DEFAULT 50,
  p_user_id UUID DEFAULT NULL,
  p_vertical TEXT DEFAULT NULL,
  p_min_arr INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  arr NUMERIC,
  vertical TEXT,
  products TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  distance_miles NUMERIC,
  ofi_score INTEGER,
  owner_name TEXT,
  property_address_street TEXT,
  property_address_city TEXT,
  property_address_state TEXT,
  property_address_postal_code TEXT,
  billing_address_street TEXT,
  billing_address_city TEXT,
  billing_address_state TEXT,
  billing_address_postal_code TEXT,
  salesforce_id TEXT,
  facility_count INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.arr,
    a.vertical,
    a.products,
    a.latitude,
    a.longitude,
    ROUND(
      CAST(
        ST_Distance(
          ST_MakePoint(p_longitude, p_latitude)::geography,
          ST_MakePoint(a.longitude, a.latitude)::geography
        ) / 1609.34 AS NUMERIC
      ),
      1
    ) AS distance_miles,
    COALESCE(latest_snapshot.latest_ofi_score, 0)::INTEGER AS ofi_score,
    a.owner_name,
    a.property_address_street,
    a.property_address_city,
    a.property_address_state,
    a.property_address_postal_code,
    a.billing_address_street,
    a.billing_address_city,
    a.billing_address_state,
    a.billing_address_postal_code,
    a.salesforce_id,
    a.facility_count
  FROM accounts a
  LEFT JOIN LATERAL (
    SELECT
      account_snapshots.ofi_score AS latest_ofi_score
    FROM account_snapshots
    WHERE account_snapshots.account_id = a.id
    ORDER BY account_snapshots.snapshot_date DESC
    LIMIT 1
  ) latest_snapshot ON true
  WHERE
    (p_user_id IS NULL OR a.user_id = p_user_id)
    AND a.latitude IS NOT NULL
    AND a.longitude IS NOT NULL
    AND a.status = 'active'
    AND ST_DWithin(
      ST_MakePoint(p_longitude, p_latitude)::geography,
      ST_MakePoint(a.longitude, a.latitude)::geography,
      p_radius_miles * 1609.34
    )
    AND (p_vertical IS NULL OR a.vertical = p_vertical)
    AND (p_min_arr = 0 OR (a.arr IS NOT NULL AND a.arr >= p_min_arr))
  ORDER BY distance_miles ASC;
END;
$$;
`;

    // Execute DROP
    const { error: dropError } = await supabase.rpc('exec', { query: dropSql });
    if (dropError) {
      console.error('Drop error (may be expected if function does not have exec rpc):', dropError);
      // Continue anyway - the CREATE OR REPLACE will handle it
    }

    // Execute CREATE - try multiple approaches
    let createError = null;

    // Approach 1: Try using rpc exec if it exists
    const { error: err1 } = await supabase.rpc('exec', { query: createSql });
    if (err1) {
      createError = err1;
      console.log('RPC exec approach failed, trying direct query...');

      // Approach 2: Try using raw SQL through the REST API
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ query: dropSql + '\n\n' + createSql }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('REST API approach also failed:', errorText);
        createError = errorText;
      } else {
        createError = null;
      }
    }

    if (createError) {
      return NextResponse.json({
        error: 'Migration failed',
        details: 'Could not execute SQL directly through API',
        message: 'Please apply the migration manually through Supabase SQL Editor',
        instructions: [
          '1. Go to https://supabase.com/dashboard',
          '2. Select your project',
          '3. Go to SQL Editor',
          '4. Copy the SQL from: supabase/migrations/20260216_add_street_addresses_to_visit_planner.sql',
          '5. Paste and run',
        ],
        sql: dropSql + '\n\n' + createSql,
      }, { status: 500 });
    }

    // Test the updated function
    console.log('Testing updated function...');
    const { data: testData, error: testError } = await supabase.rpc('find_nearby_accounts', {
      p_latitude: 30.2672,
      p_longitude: -97.7431,
      p_radius_miles: 10,
      p_user_id: null,
      p_vertical: null,
      p_min_arr: 0,
    });

    if (testError) {
      return NextResponse.json({
        error: 'Function test failed',
        details: testError.message,
      }, { status: 500 });
    }

    const hasStreetField = testData && testData.length > 0 && 'property_address_street' in testData[0];

    return NextResponse.json({
      success: true,
      message: 'Migration applied successfully!',
      test: {
        accountsFound: testData?.length || 0,
        hasStreetAddressField: hasStreetField,
        sampleAccount: testData && testData.length > 0 ? {
          name: testData[0].name,
          city: testData[0].property_address_city,
          street: testData[0].property_address_street || 'N/A',
        } : null,
      },
      newFields: [
        'property_address_street',
        'property_address_postal_code',
        'billing_address_street',
        'billing_address_postal_code',
        'facility_count',
      ],
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({
      error: 'Migration failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
