-- Create vitally_accounts table to store Vitally customer health data
CREATE TABLE IF NOT EXISTS vitally_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vitally_account_id TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, -- Link to our accounts table
  salesforce_account_id TEXT, -- Salesforce ID from Vitally for matching
  account_name TEXT NOT NULL,
  health_score NUMERIC,
  nps_score NUMERIC,
  status TEXT,
  mrr NUMERIC,
  traits JSONB, -- Store all Vitally account traits
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, vitally_account_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vitally_accounts_user_id ON vitally_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_vitally_accounts_account_id ON vitally_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_vitally_accounts_salesforce_id ON vitally_accounts(salesforce_account_id);
CREATE INDEX IF NOT EXISTS idx_vitally_accounts_health_score ON vitally_accounts(health_score DESC);

-- Enable RLS
ALTER TABLE vitally_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see their own Vitally accounts
CREATE POLICY "Users can view their own Vitally accounts"
  ON vitally_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS policy: users can insert their own Vitally accounts
CREATE POLICY "Users can insert their own Vitally accounts"
  ON vitally_accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS policy: users can update their own Vitally accounts
CREATE POLICY "Users can update their own Vitally accounts"
  ON vitally_accounts
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS policy: users can delete their own Vitally accounts
CREATE POLICY "Users can delete their own Vitally accounts"
  ON vitally_accounts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add Vitally columns to existing accounts table
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS vitally_health_score NUMERIC,
  ADD COLUMN IF NOT EXISTS vitally_nps_score NUMERIC,
  ADD COLUMN IF NOT EXISTS vitally_status TEXT,
  ADD COLUMN IF NOT EXISTS vitally_last_activity_at TIMESTAMPTZ;

COMMENT ON TABLE vitally_accounts IS 'Stores Vitally customer health and engagement data';
COMMENT ON COLUMN vitally_accounts.health_score IS 'Vitally health score (0-100)';
COMMENT ON COLUMN vitally_accounts.nps_score IS 'Net Promoter Score';
COMMENT ON COLUMN vitally_accounts.traits IS 'Additional Vitally account traits and metadata';
