-- ============================================================================
-- Migration: Fix "ofi_score is ambiguous" error in find_nearby_accounts
-- Date: 2026-02-09
-- Purpose: Explicitly qualify all column references to avoid ambiguity
-- ============================================================================

CREATE OR REPLACE FUNCTION find_nearby_accounts(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_radius_miles DECIMAL,
  p_user_id UUID,
  p_vertical TEXT DEFAULT NULL,
  p_min_arr DECIMAL DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  arr DECIMAL,
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
) AS $$
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
    -- Calculate distance using Haversine formula (in miles)
    (
      3959 * acos(
        cos(radians(p_latitude)) *
        cos(radians(a.latitude)) *
        cos(radians(a.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) *
        sin(radians(a.latitude))
      )
    )::DECIMAL as distance_miles,
    -- Get latest OFI score from account_snapshots (explicitly use s.ofi_score)
    COALESCE(s.ofi_score, 0)::INTEGER as ofi_score,
    a.owner_name,
    a.property_address_city,
    a.property_address_state,
    a.salesforce_id
  FROM accounts a
  -- Get latest OFI score using LATERAL join to account_snapshots
  LEFT JOIN LATERAL (
    SELECT account_snapshots.ofi_score
    FROM account_snapshots
    WHERE account_snapshots.account_id = a.id
    ORDER BY account_snapshots.snapshot_date DESC
    LIMIT 1
  ) s ON true
  WHERE
    a.user_id = p_user_id
    AND a.latitude IS NOT NULL
    AND a.longitude IS NOT NULL
    -- Distance filter (using Haversine formula)
    AND (
      3959 * acos(
        cos(radians(p_latitude)) *
        cos(radians(a.latitude)) *
        cos(radians(a.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) *
        sin(radians(a.latitude))
      )
    ) <= p_radius_miles
    -- Vertical filter
    AND (p_vertical IS NULL OR a.vertical = p_vertical)
    -- ARR filter
    AND (a.arr IS NULL OR a.arr >= p_min_arr)
  ORDER BY distance_miles ASC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_nearby_accounts IS 'Find accounts within radius of a location with optional filters. Returns accounts sorted by distance with OFI scores from account_snapshots.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
