-- ================================================================
-- Clean up William Warren Group and fix Unknown origins
-- ================================================================

-- STEP 1: Delete cases from the first William Warren account
-- This will allow re-syncing with fresh Origin data

DELETE FROM friction_cards
WHERE account_id = '96f68f1f-aafa-45c6-b1b0-09f427b56e6c';

DELETE FROM raw_inputs
WHERE account_id = '96f68f1f-aafa-45c6-b1b0-09f427b56e6c'
  AND source_type = 'salesforce_case';

-- STEP 2: Verify the data is deleted
SELECT COUNT(*) as remaining_cases
FROM raw_inputs
WHERE account_id = '96f68f1f-aafa-45c6-b1b0-09f427b56e6c'
  AND source_type = 'salesforce_case';

-- Should return 0 cases

-- STEP 3: Now go to the app and find William Warren Group
-- Click "Analyze Friction" button
-- This will sync fresh cases with Origin field populated

-- STEP 4: After re-syncing, verify origins are correct
SELECT
  metadata->>'case_number' as case_num,
  metadata->>'origin' as origin,
  metadata->>'subject' as subject,
  created_at as synced_at
FROM raw_inputs
WHERE account_id = '96f68f1f-aafa-45c6-b1b0-09f427b56e6c'
  AND source_type = 'salesforce_case'
ORDER BY created_at DESC
LIMIT 20;

-- You should now see origins like "Phone", "Email", "Web", "Chat" instead of "Unknown"

-- ================================================================
-- BONUS: Clean up Go Store It duplicates (optional)
-- ================================================================

-- If you also want to fix Go Store It, run these:

-- DELETE FROM friction_cards
-- WHERE account_id = '226e78e1-2e4c-4928-8be9-2ba0ca512cb8';

-- DELETE FROM raw_inputs
-- WHERE account_id = '226e78e1-2e4c-4928-8be9-2ba0ca512cb8'
--   AND source_type = 'salesforce_case';

-- Then re-sync that account too!
