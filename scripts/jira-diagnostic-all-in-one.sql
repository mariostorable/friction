-- =====================================================================
-- ALL-IN-ONE JIRA DIAGNOSTIC - Returns all results in single output
-- =====================================================================

WITH
-- Step 1: Check constraints
constraints AS (
  SELECT
    '1️⃣ Constraints' as step,
    conname as detail,
    pg_get_constraintdef(oid) as value
  FROM pg_constraint
  WHERE conrelid = 'theme_jira_links'::regclass
),

-- Step 2: Table status
table_status AS (
  SELECT
    '2️⃣ Table Status' as step,
    'Total Links' as detail,
    COUNT(*)::text as value
  FROM theme_jira_links
  UNION ALL
  SELECT
    '2️⃣ Table Status',
    'Unique Themes',
    COUNT(DISTINCT theme_key)::text
  FROM theme_jira_links
  UNION ALL
  SELECT
    '2️⃣ Table Status',
    'Unique Jira Issues',
    COUNT(DISTINCT jira_issue_id)::text
  FROM theme_jira_links
),

-- Step 3: Table columns
table_columns AS (
  SELECT
    '3️⃣ Columns' as step,
    column_name as detail,
    data_type || ' (' || is_nullable || ')' as value
  FROM information_schema.columns
  WHERE table_name = 'theme_jira_links'
  ORDER BY ordinal_position
  LIMIT 10
),

-- Step 4: Count potential matches
potential_matches AS (
  SELECT
    '4️⃣ Potential Matches' as step,
    'Jira tickets with keywords' as detail,
    COUNT(DISTINCT ji.id)::text as value
  FROM jira_issues ji
  CROSS JOIN (
    SELECT DISTINCT theme_key
    FROM friction_cards
    WHERE is_friction = true
    LIMIT 5
  ) fc
  WHERE lower(ji.summary || ' ' || COALESCE(ji.description, '')) LIKE
    '%' || split_part(fc.theme_key, '_', 1) || '%'
),

-- Step 5: Friction themes
themes AS (
  SELECT
    '5️⃣ Themes' as step,
    theme_key as detail,
    COUNT(*)::text as value
  FROM friction_cards
  WHERE is_friction = true
  GROUP BY theme_key
  ORDER BY COUNT(*) DESC
  LIMIT 10
)

-- Combine all results
SELECT * FROM constraints
UNION ALL
SELECT * FROM table_status
UNION ALL
SELECT * FROM table_columns
UNION ALL
SELECT * FROM potential_matches
UNION ALL
SELECT * FROM themes
ORDER BY step, detail;
