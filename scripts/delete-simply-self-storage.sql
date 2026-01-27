-- Delete Simply Self Storage - CORP account and all related data
-- Run this in Supabase SQL Editor

BEGIN;

-- Get the account_id first (for verification)
SELECT id, name, arr FROM accounts WHERE name ILIKE '%Simply Self Storage - CORP%';

-- Delete related data in order (to handle foreign key constraints)
DELETE FROM friction_cards
WHERE account_id IN (SELECT id FROM accounts WHERE name ILIKE '%Simply Self Storage - CORP%');

DELETE FROM raw_inputs
WHERE account_id IN (SELECT id FROM accounts WHERE name ILIKE '%Simply Self Storage - CORP%');

DELETE FROM account_snapshots
WHERE account_id IN (SELECT id FROM accounts WHERE name ILIKE '%Simply Self Storage - CORP%');

DELETE FROM shared_links
WHERE account_id IN (SELECT id FROM accounts WHERE name ILIKE '%Simply Self Storage - CORP%');

DELETE FROM portfolio_members
WHERE account_id IN (SELECT id FROM accounts WHERE name ILIKE '%Simply Self Storage - CORP%');

-- Finally delete the account itself
DELETE FROM accounts
WHERE name ILIKE '%Simply Self Storage - CORP%';

COMMIT;

-- Verify deletion
SELECT COUNT(*) as remaining_accounts FROM accounts WHERE name ILIKE '%Simply Self Storage%';
