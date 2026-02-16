-- Add street addresses to Visit Planner function
-- Date: 2026-02-16
-- Purpose: Include property_address_street and billing_address_street in nearby accounts results

-- Drop existing function
DROP FUNCTION IF EXISTS find_nearby_accounts CASCADE;

-- Recreate function with street address fields
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
      p_radius_miles * 1609.34 -- Convert miles to meters
    )
    AND (p_vertical IS NULL OR a.vertical = p_vertical)
    AND (p_min_arr = 0 OR (a.arr IS NOT NULL AND a.arr >= p_min_arr))
  ORDER BY distance_miles ASC;
END;
$$;

COMMENT ON FUNCTION find_nearby_accounts IS 'Find accounts within radius of a location with full address data. Shows all accounts including those with $0 or NULL ARR. Users can still filter by min_arr if desired.';
