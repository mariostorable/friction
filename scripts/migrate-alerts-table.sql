-- Drop existing alerts table if it exists (safe to do since alerts are temporary)
DROP TABLE IF EXISTS alerts CASCADE;

-- Create alerts table with full schema
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('high_friction', 'trending_worse', 'abnormal_volume', 'critical_severity')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  evidence JSONB DEFAULT '{}',
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Add indexes for performance
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_account_id ON alerts(account_id);
CREATE INDEX idx_alerts_dismissed ON alerts(dismissed);
CREATE INDEX idx_alerts_created_at ON alerts(created_at);
CREATE INDEX idx_alerts_expires_at ON alerts(expires_at);

-- Enable RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Create policy: users can only see their own alerts
CREATE POLICY "Users can view their own alerts"
  ON alerts FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: users can update their own alerts (for dismissing)
CREATE POLICY "Users can update their own alerts"
  ON alerts FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy: system can insert alerts (service role)
CREATE POLICY "Service role can insert alerts"
  ON alerts FOR INSERT
  WITH CHECK (true);
