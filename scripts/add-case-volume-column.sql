-- Add case_volume column to account_snapshots table
-- This tracks the number of support cases analyzed in each snapshot

ALTER TABLE account_snapshots
ADD COLUMN IF NOT EXISTS case_volume INTEGER;

-- Add a comment to document the column
COMMENT ON COLUMN account_snapshots.case_volume IS 'Number of support cases analyzed in the 90-day period for this snapshot';

-- Optional: Add an index if you plan to query/filter by case_volume frequently
-- CREATE INDEX IF NOT EXISTS idx_account_snapshots_case_volume ON account_snapshots(case_volume);
