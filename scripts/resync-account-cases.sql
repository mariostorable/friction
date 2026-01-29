-- ================================================================
-- Re-sync Cases for a Specific Account
-- This will delete existing case data and force a fresh sync
-- Run this in Supabase SQL Editor
-- ================================================================

-- STEP 1: Find the account ID you want to re-sync
-- Replace 'Go Store It Management LLC - CORP' with your account name
SELECT id, name, salesforce_id
FROM accounts
WHERE name ILIKE '%Go Store It%'
LIMIT 10;

-- STEP 2: Delete existing cases for this account
-- Replace 'YOUR_ACCOUNT_ID_HERE' with the actual UUID from step 1
-- UNCOMMENT the lines below after replacing the ID

-- DELETE FROM friction_cards
-- WHERE account_id = 'YOUR_ACCOUNT_ID_HERE';

-- DELETE FROM raw_inputs
-- WHERE account_id = 'YOUR_ACCOUNT_ID_HERE'
--   AND source_type = 'salesforce_case';

-- STEP 3: Now go to the app and click "Sync Cases" button for this account
-- The sync will fetch all cases fresh from Salesforce with the Origin field

-- STEP 4: Verify Origin field is now populated
-- Run this after re-syncing:
-- SELECT
--   metadata->>'case_number' as case_num,
--   metadata->>'origin' as origin,
--   created_at as synced_at
-- FROM raw_inputs
-- WHERE account_id = 'YOUR_ACCOUNT_ID_HERE'
--   AND source_type = 'salesforce_case'
-- ORDER BY created_at DESC
-- LIMIT 10;
