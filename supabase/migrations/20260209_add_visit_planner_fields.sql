-- Migration: Add Visit Planner fields to accounts table
-- Purpose: Support geo-aware account mapping for client visit planning
-- Created: 2026-02-09

-- Add address and geocoding fields to accounts table
ALTER TABLE accounts
  -- Property address (preferred - from Salesforce ShippingAddress)
  ADD COLUMN IF NOT EXISTS property_address_street TEXT,
  ADD COLUMN IF NOT EXISTS property_address_city TEXT,
  ADD COLUMN IF NOT EXISTS property_address_state TEXT,
  ADD COLUMN IF NOT EXISTS property_address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS property_address_country TEXT,

  -- Billing address (fallback - from Salesforce BillingAddress)
  ADD COLUMN IF NOT EXISTS billing_address_street TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_state TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_country TEXT,

  -- Geocoding data (from SmartyStreets via Salesforce or Google Maps fallback)
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS geocode_source TEXT, -- 'salesforce' (SmartyStreets) or 'google' (manual)
  ADD COLUMN IF NOT EXISTS geocode_quality TEXT, -- 'high' (verified), 'medium' (approximate), 'low' (fallback)
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,

  -- Account hierarchy for Ultimate Parent lookups
  ADD COLUMN IF NOT EXISTS ultimate_parent_id TEXT;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_accounts_latitude
  ON accounts(latitude)
  WHERE latitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_longitude
  ON accounts(longitude)
  WHERE longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_geocoded_at
  ON accounts(geocoded_at);

CREATE INDEX IF NOT EXISTS idx_accounts_ultimate_parent_id
  ON accounts(ultimate_parent_id);

-- Create spatial index using PostGIS for proximity queries
-- Note: Requires PostGIS extension (should already be enabled in Supabase)
CREATE INDEX IF NOT EXISTS idx_accounts_location_geo
  ON accounts USING GIST (
    ST_MakePoint(longitude, latitude)::geography
  )
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add helpful column comments for documentation
COMMENT ON COLUMN accounts.latitude IS 'Geocoded latitude from SmartyStreets (via Salesforce) or Google Maps fallback';
COMMENT ON COLUMN accounts.longitude IS 'Geocoded longitude from SmartyStreets (via Salesforce) or Google Maps fallback';
COMMENT ON COLUMN accounts.geocode_source IS 'Origin of geocode: salesforce (SmartyStreets) or google (manual geocoding)';
COMMENT ON COLUMN accounts.geocode_quality IS 'Quality indicator: high (verified by SmartyStreets), medium (approximate), low (fallback)';
COMMENT ON COLUMN accounts.property_address_street IS 'Physical property address from Salesforce ShippingAddress (primary for visit planning)';
COMMENT ON COLUMN accounts.billing_address_street IS 'Billing address from Salesforce BillingAddress (fallback)';
COMMENT ON COLUMN accounts.ultimate_parent_id IS 'Salesforce UltimateParentId for account hierarchy lookups';

-- Create database function for efficient proximity search
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
    AND (a.arr >= p_min_arr OR a.arr IS NULL)
  ORDER BY distance_miles ASC;
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION find_nearby_accounts IS 'Find accounts within radius of a location with optional filters. Returns accounts sorted by distance.';
