-- =====================================================================
-- QUICK JIRA DIAGNOSTIC - Run all at once in Supabase SQL Editor
-- =====================================================================
-- Copy and paste this entire file into Supabase SQL Editor
-- =====================================================================

-- 1. CHECK: theme_jira_links table constraints
SELECT
  '1️⃣ Table Constraints' as step,
  conname as constraint_name,
  contype as type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'theme_jira_links'::regclass;

-- Expected: UNIQUE constraint on (user_id, jira_issue_id, theme_key)
-- If different, update sync code's onConflict parameter

-- =====================================================================

-- 2. CHECK: Current state of theme_jira_links table
SELECT
  '2️⃣ Table Status' as step,
  COUNT(*) as total_links,
  COUNT(DISTINCT user_id) as users,
  COUNT(DISTINCT jira_issue_id) as jira_issues,
  COUNT(DISTINCT theme_key) as themes
FROM theme_jira_links;

-- Expected: All zeros currently (this is the problem)

-- =====================================================================

-- 3. CHECK: Table structure
SELECT
  '3️⃣ Table Columns' as step,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'theme_jira_links'
ORDER BY ordinal_position;

-- Verify required columns exist: user_id, jira_issue_id, theme_key, match_type, confidence

-- =====================================================================

-- 4. TEST: Can we manually insert a link?
-- This will either succeed or show the exact error
DO $$
BEGIN
  INSERT INTO theme_jira_links (
    user_id,
    jira_issue_id,
    theme_key,
    jira_key,
    match_type,
    confidence
  )
  SELECT
    user_id,
    id,
    'access_permissions',
    jira_key,
    'test',
    0.9
  FROM jira_issues
  WHERE summary ILIKE '%password%' OR summary ILIKE '%login%'
  LIMIT 1
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '4️⃣ Manual Insert: SUCCESS - Link was created (or already existed)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '4️⃣ Manual Insert: FAILED - %', SQLERRM;
END $$;

-- Check if test link was created
SELECT
  '4️⃣ Test Link Result' as step,
  COUNT(*) as test_links_created
FROM theme_jira_links
WHERE match_type = 'test';

-- =====================================================================

-- 5. CHECK: Do we have Jira issues with keywords that should match themes?
SELECT
  '5️⃣ Potential Matches' as step,
  COUNT(DISTINCT ji.id) as jira_tickets_with_matching_keywords,
  string_agg(DISTINCT fc.theme_key, ', ') as themes_that_could_match
FROM jira_issues ji
CROSS JOIN (
  SELECT DISTINCT theme_key
  FROM friction_cards
  WHERE is_friction = true
  LIMIT 20
) fc
WHERE
  lower(ji.summary || ' ' || COALESCE(ji.description, '')) LIKE
    '%' || split_part(fc.theme_key, '_', 1) || '%'
LIMIT 1;

-- Shows if keyword matching SHOULD find matches

-- =====================================================================

-- 6. CHECK: Actual friction themes in database
SELECT
  '6️⃣ Friction Themes' as step,
  theme_key,
  COUNT(*) as card_count
FROM friction_cards
WHERE is_friction = true
GROUP BY theme_key
ORDER BY card_count DESC
LIMIT 10;

-- Shows what themes exist to match against

-- =====================================================================

-- 7. CLEANUP: Remove test links (optional)
-- Uncomment to clean up test links
-- DELETE FROM theme_jira_links WHERE match_type = 'test';

-- =====================================================================
-- INTERPRETATION OF RESULTS:
-- =====================================================================
-- Step 1: If constraint is NOT (user_id, jira_issue_id, theme_key), update sync code
-- Step 2: Should show 0 links (this is the bug we're fixing)
-- Step 3: Verify all required columns exist
-- Step 4: If manual insert SUCCEEDS → sync code issue
--         If manual insert FAILS → database/permissions issue
-- Step 5: Should show >0 potential matches
-- Step 6: Should show your actual theme keys
-- =====================================================================
