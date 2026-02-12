-- Fix type mismatch in find_nearby_accounts return type
-- Date: 2026-02-12
-- Purpose: Match function return types to actual column types in accounts table

-- Drop existing function
DROP FUNCTION IF EXISTS find_nearby_accounts CASCADE;

-- Recreate function with correct type matching
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
  property_address_city TEXT,
  property_address_state TEXT,
  salesforce_id TEXT
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
    a.property_address_city,
    a.property_address_state,
    a.salesforce_id
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
    AND a.arr IS NOT NULL
    AND a.arr > 0
    AND a.arr >= p_min_arr
  ORDER BY distance_miles ASC;
END;
$$;

COMMENT ON FUNCTION find_nearby_accounts IS 'Find accounts within radius of a location with optional filters. Fixed type matching between return type and actual columns.';
