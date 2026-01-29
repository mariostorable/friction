-- ================================================================
-- Fix Unknown Case Origins by Re-syncing
-- Run this in Supabase SQL Editor to reset cases and get fresh Origin data
-- ================================================================

-- STEP 1: Find the account you want to fix
-- Replace 'William Warren Group' or other account name
SELECT id, name, salesforce_id
FROM accounts
WHERE name ILIKE '%William Warren%'
   OR name ILIKE '%Go Store It%'
LIMIT 10;

-- STEP 2: Check current origin data for this account
-- Replace 'YOUR_ACCOUNT_ID' with the UUID from step 1
-- SELECT
--   metadata->>'case_number' as case_num,
--   metadata->>'origin' as origin,
--   metadata->>'Origin' as capital_origin,
--   created_at
-- FROM raw_inputs
-- WHERE account_id = 'YOUR_ACCOUNT_ID'
--   AND source_type = 'salesforce_case'
-- ORDER BY created_at DESC
-- LIMIT 20;

-- STEP 3: Delete existing cases for this account to force fresh sync
-- UNCOMMENT the lines below after replacing YOUR_ACCOUNT_ID

-- DELETE FROM friction_cards
-- WHERE account_id = 'YOUR_ACCOUNT_ID';

-- DELETE FROM raw_inputs
-- WHERE account_id = 'YOUR_ACCOUNT_ID'
--   AND source_type = 'salesforce_case';

-- STEP 4: Now go to the app and click "Analyze Friction" button
-- This will:
-- 1. Sync cases from Salesforce (with Origin field)
-- 2. Analyze them
-- 3. Calculate OFI score
-- All in one click!

-- STEP 5: Verify origins are now populated correctly
-- Run this after re-syncing:
-- SELECT
--   metadata->>'case_number' as case_num,
--   metadata->>'origin' as origin,
--   metadata->>'subject' as subject,
--   created_at
-- FROM raw_inputs
-- WHERE account_id = 'YOUR_ACCOUNT_ID'
--   AND source_type = 'salesforce_case'
-- ORDER BY created_at DESC
-- LIMIT 20;
