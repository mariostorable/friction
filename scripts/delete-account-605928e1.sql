-- Delete account 605928e1-ab61-4962-8b8f-a2b8c570cd86 and all related data
-- Run this in Supabase SQL Editor

BEGIN;

-- Get the account name first (for verification)
SELECT id, name, arr FROM accounts WHERE id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';

-- Delete related data in order (to handle foreign key constraints)
DELETE FROM friction_cards
WHERE account_id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';

DELETE FROM raw_inputs
WHERE account_id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';

DELETE FROM account_snapshots
WHERE account_id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';

DELETE FROM shared_links
WHERE account_id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';

DELETE FROM portfolio_members
WHERE account_id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';

DELETE FROM favorites
WHERE account_id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';

-- Finally delete the account itself
DELETE FROM accounts
WHERE id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';

COMMIT;

-- Verify deletion
SELECT COUNT(*) as remaining_accounts FROM accounts WHERE id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';
