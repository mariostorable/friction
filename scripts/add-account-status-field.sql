-- Add status field to accounts table to track active/cancelled accounts
-- Run this in Supabase SQL Editor

-- Add status column with default 'active'
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'churned'));

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

-- Mark Simply Self Storage as cancelled
UPDATE accounts
SET status = 'cancelled'
WHERE name ILIKE '%Simply Self Storage - CORP%';

-- Verify the update
SELECT id, name, arr, status
FROM accounts
WHERE name ILIKE '%Simply Self Storage%';

-- Show all cancelled accounts
SELECT id, name, arr, status, customer_since
FROM accounts
WHERE status = 'cancelled'
ORDER BY arr DESC;
