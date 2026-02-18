-- Enable RLS on PostGIS system table spatial_ref_sys
-- This is a standard reference table with coordinate system definitions
-- It contains no user data and should be publicly readable

-- Enable RLS
ALTER TABLE spatial_ref_sys ENABLE ROW LEVEL SECURITY;

-- Allow public read access (this is reference data, not user data)
CREATE POLICY "spatial_ref_sys_public_read"
ON spatial_ref_sys
FOR SELECT
TO public
USING (true);

-- Add comment explaining why this table is public
COMMENT ON TABLE spatial_ref_sys IS 'PostGIS system table containing spatial reference system definitions. Public read access is safe as this contains only standard coordinate system reference data.';
