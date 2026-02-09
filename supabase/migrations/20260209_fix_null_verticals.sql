-- ============================================================================
-- Migration: Fix NULL Verticals and Add Geocoding Helper
-- Date: 2026-02-09
-- Purpose: Fix accounts with NULL vertical and prepare for Google geocoding
-- ============================================================================

-- Set all NULL verticals to 'storage' as safe default
-- Most Storable accounts are storage, and we can refine later
UPDATE accounts
SET vertical = 'storage'
WHERE vertical IS NULL
  AND status = 'active';

-- Create function to get accounts needing geocoding
CREATE OR REPLACE FUNCTION get_accounts_needing_geocoding(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  name TEXT,
  property_address_street TEXT,
  property_address_city TEXT,
  property_address_state TEXT,
  property_address_postal_code TEXT,
  property_address_country TEXT,
  billing_address_street TEXT,
  billing_address_city TEXT,
  billing_address_state TEXT,
  billing_address_postal_code TEXT,
  billing_address_country TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.property_address_street,
    a.property_address_city,
    a.property_address_state,
    a.property_address_postal_code,
    a.property_address_country,
    a.billing_address_street,
    a.billing_address_city,
    a.billing_address_state,
    a.billing_address_postal_code,
    a.billing_address_country
  FROM accounts a
  WHERE a.user_id = p_user_id
    AND a.status = 'active'
    AND a.latitude IS NULL
    AND a.longitude IS NULL
    AND (
      -- Has property address
      (a.property_address_city IS NOT NULL AND a.property_address_state IS NOT NULL)
      OR
      -- Or has billing address
      (a.billing_address_city IS NOT NULL AND a.billing_address_state IS NOT NULL)
    )
  ORDER BY a.arr DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_accounts_needing_geocoding IS 'Returns accounts that have addresses but no geocoding coordinates, ordered by ARR';

-- ============================================================================
-- Migration Complete
-- ============================================================================
