-- Mark Simply Self Storage - CORP as cancelled
-- Run this in Supabase SQL Editor

BEGIN;

-- First, verify the account exists and show current status
SELECT id, name, arr, status
FROM accounts
WHERE name ILIKE '%Simply Self Storage - CORP%';

-- Mark as cancelled
UPDATE accounts
SET status = 'cancelled'
WHERE name ILIKE '%Simply Self Storage - CORP%';

-- Verify the update
SELECT id, name, arr, status
FROM accounts
WHERE name ILIKE '%Simply Self Storage - CORP%';

COMMIT;

-- Optional: View all cancelled accounts
SELECT id, name, arr, status, customer_since
FROM accounts
WHERE status = 'cancelled'
ORDER BY arr DESC;

-- NOTES:
-- - Cancelled accounts will NOT appear in dashboard
-- - Cancelled accounts will NOT be included in Top 25 portfolios
-- - Cancelled accounts will be SKIPPED by the automated analysis job
-- - Historical data (friction cards, snapshots) is PRESERVED
-- - To reactivate: UPDATE accounts SET status = 'active' WHERE id = 'account-id';
