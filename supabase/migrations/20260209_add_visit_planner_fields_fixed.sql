-- ============================================================================
-- Migration: Add Visit Planner Fields to Accounts Table
-- Date: 2026-02-09
-- Purpose: Support geo-aware visit planning with addresses and coordinates
-- ============================================================================

-- Step 1: Add address and geocoding columns
-- ============================================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS property_address_street TEXT,
  ADD COLUMN IF NOT EXISTS property_address_city TEXT,
  ADD COLUMN IF NOT EXISTS property_address_state TEXT,
  ADD COLUMN IF NOT EXISTS property_address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS property_address_country TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_street TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_state TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_country TEXT,
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS geocode_source TEXT,
  ADD COLUMN IF NOT EXISTS geocode_quality TEXT,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimate_parent_id TEXT;

-- Step 2: Create basic indexes for filtering
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_accounts_property_city ON accounts (property_address_city)
WHERE property_address_city IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_property_state ON accounts (property_address_state)
WHERE property_address_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_ultimate_parent ON accounts (ultimate_parent_id)
WHERE ultimate_parent_id IS NOT NULL;

-- Step 3: Enable PostGIS extension (if not already enabled)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- Step 4: Create spatial index using ST_SetSRID (alternative to :: casting)
-- ============================================================================
-- This syntax should work in Supabase without :: casting issues
CREATE INDEX IF NOT EXISTS idx_accounts_location_geo ON accounts
USING GIST (
  ST_Transform(
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
    4326
  )
)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Step 5: Create function to find nearby accounts
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
    -- Get latest OFI score
    COALESCE(latest_ofi.score, 0)::INTEGER as ofi_score,
    a.owner_name,
    a.property_address_city,
    a.property_address_state,
    a.salesforce_id
  FROM accounts a
  -- Get latest OFI score using LATERAL join
  LEFT JOIN LATERAL (
    SELECT score
    FROM ofi_scores
    WHERE account_id = a.id
    ORDER BY created_at DESC
    LIMIT 1
  ) latest_ofi ON true
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

-- Step 6: Add comments for documentation
-- ============================================================================
COMMENT ON COLUMN accounts.property_address_street IS 'Property/shipping address street from Salesforce';
COMMENT ON COLUMN accounts.property_address_city IS 'Property/shipping address city from Salesforce';
COMMENT ON COLUMN accounts.property_address_state IS 'Property/shipping address state from Salesforce';
COMMENT ON COLUMN accounts.property_address_postal_code IS 'Property/shipping address postal code from Salesforce';
COMMENT ON COLUMN accounts.property_address_country IS 'Property/shipping address country from Salesforce';
COMMENT ON COLUMN accounts.billing_address_street IS 'Billing address street from Salesforce (fallback)';
COMMENT ON COLUMN accounts.billing_address_city IS 'Billing address city from Salesforce (fallback)';
COMMENT ON COLUMN accounts.billing_address_state IS 'Billing address state from Salesforce (fallback)';
COMMENT ON COLUMN accounts.billing_address_postal_code IS 'Billing address postal code from Salesforce (fallback)';
COMMENT ON COLUMN accounts.billing_address_country IS 'Billing address country from Salesforce (fallback)';
COMMENT ON COLUMN accounts.latitude IS 'Latitude coordinate (decimal degrees) from SmartyStreets or Google Maps';
COMMENT ON COLUMN accounts.longitude IS 'Longitude coordinate (decimal degrees) from SmartyStreets or Google Maps';
COMMENT ON COLUMN accounts.geocode_source IS 'Source of geocoding: salesforce (SmartyStreets) or google';
COMMENT ON COLUMN accounts.geocode_quality IS 'Quality indicator: high, medium, low';
COMMENT ON COLUMN accounts.geocoded_at IS 'Timestamp when coordinates were last updated';
COMMENT ON COLUMN accounts.ultimate_parent_id IS 'Salesforce Ultimate Parent ID for account hierarchy';

COMMENT ON FUNCTION find_nearby_accounts IS 'Find accounts within radius of a location with optional filters. Uses Haversine formula for distance calculation.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
