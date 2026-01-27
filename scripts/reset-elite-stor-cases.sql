-- Reset case data for Elite-Stor Storage - CORP to force a full re-sync
-- This will allow the sync to pull all cases (up to 2000) instead of just incremental updates
-- Run this in Supabase SQL Editor

BEGIN;

-- Get the account_id first (for verification)
SELECT id, name, arr FROM accounts WHERE name ILIKE '%Elite-Stor Storage - CORP%';

-- Delete friction cards for this account
DELETE FROM friction_cards
WHERE account_id IN (SELECT id FROM accounts WHERE name ILIKE '%Elite-Stor Storage - CORP%');

-- Delete raw inputs (cases) for this account
DELETE FROM raw_inputs
WHERE account_id IN (SELECT id FROM accounts WHERE name ILIKE '%Elite-Stor Storage - CORP%');

-- Optionally delete account snapshots to reset OFI history
-- DELETE FROM account_snapshots
-- WHERE account_id IN (SELECT id FROM accounts WHERE name ILIKE '%Elite-Stor Storage - CORP%');

COMMIT;

-- Verify deletion
SELECT
  a.name,
  (SELECT COUNT(*) FROM friction_cards WHERE account_id = a.id) as friction_cards,
  (SELECT COUNT(*) FROM raw_inputs WHERE account_id = a.id) as raw_inputs
FROM accounts a
WHERE a.name ILIKE '%Elite-Stor Storage - CORP%';
