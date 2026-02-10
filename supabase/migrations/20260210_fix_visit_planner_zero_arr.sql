-- Fix Visit Planner to exclude accounts with NULL or $0 ARR
-- Purpose: Prevent accounts with no revenue from appearing in Visit Planner results
-- Created: 2026-02-10

-- Replace the find_nearby_accounts function with fixed ARR filtering
CREATE OR REPLACE FUNCTION find_nearby_accounts(
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
  arr INTEGER,
  vertical TEXT,
  products TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  distance_miles DECIMAL,
  ofi_score INTEGER,
  owner_name TEXT,
  property_address_city TEXT,
  property_address_state TEXT,
  salesforce_id TEXT
)
LANGUAGE plpgsql
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
    COALESCE(s.ofi_score, 0) AS ofi_score,
    a.owner_name,
    a.property_address_city,
    a.property_address_state,
    a.salesforce_id
  FROM accounts a
  LEFT JOIN LATERAL (
    SELECT ofi_score
    FROM account_snapshots
    WHERE account_id = a.id
    ORDER BY snapshot_date DESC
    LIMIT 1
  ) s ON true
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

COMMENT ON FUNCTION find_nearby_accounts IS 'Find accounts within radius of a location with optional filters. Excludes accounts with NULL or zero ARR. Returns accounts sorted by distance.';
