-- Create shared_links table for account sharing functionality
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS shared_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  access_level TEXT NOT NULL DEFAULT 'read_only' CHECK (access_level IN ('read_only', 'comment')),
  expires_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links(token);

-- Create index on account_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_shared_links_account_id ON shared_links(account_id);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_shared_links_user_id ON shared_links(user_id);

-- RLS Policies
ALTER TABLE shared_links ENABLE ROW LEVEL SECURITY;

-- Users can see their own shared links
CREATE POLICY "Users can view their own shared links"
  ON shared_links FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create shared links for their own accounts
CREATE POLICY "Users can create shared links"
  ON shared_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own shared links
CREATE POLICY "Users can update their own shared links"
  ON shared_links FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own shared links
CREATE POLICY "Users can delete their own shared links"
  ON shared_links FOR DELETE
  USING (auth.uid() = user_id);

-- Public can access active, non-expired links (for the share endpoint)
CREATE POLICY "Public can access active shared links"
  ON shared_links FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Verify the table was created
SELECT * FROM shared_links LIMIT 1;
