-- ================================================================
-- Enable RLS on themes table
-- Date: 2026-02-11
-- Purpose: Fix security warning about RLS not being enabled on themes
-- ================================================================

-- Enable RLS on themes table
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read all themes
CREATE POLICY "Allow authenticated users to read themes"
  ON public.themes
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy to allow service role to do everything with themes
CREATE POLICY "Allow service role full access to themes"
  ON public.themes
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- NOTE: spatial_ref_sys RLS warning can be safely ignored
--
-- spatial_ref_sys is a PostGIS extension system table that we don't own
-- and cannot modify. The RLS warning is a false positive - PostGIS
-- manages this table's security internally.
--
-- To suppress the warning, contact Supabase support or add an exception
-- in your project settings for PostGIS system tables.
-- ================================================================
