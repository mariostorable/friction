-- =====================================================================
-- SMART BACKFILL: Create theme links using the same logic as sync code
-- =====================================================================
-- Matches the getThemeLinksFromActualThemes() logic:
-- - Splits theme_key by underscore
-- - Filters words > 3 characters
-- - Requires 2+ matching words (high confidence)
-- - Or 1 matching word for single-word themes (medium confidence)
-- =====================================================================

-- High confidence matches (2+ words match)
WITH theme_words AS (
  SELECT DISTINCT
    fc.theme_key,
    unnest(string_to_array(lower(fc.theme_key), '_')) as word
  FROM (
    SELECT DISTINCT theme_key
    FROM friction_cards
    WHERE is_friction = true
  ) fc
),
theme_word_list AS (
  SELECT
    theme_key,
    array_agg(word) FILTER (WHERE length(word) > 3) as words
  FROM theme_words
  GROUP BY theme_key
  HAVING COUNT(word) FILTER (WHERE length(word) > 3) > 0
),
jira_content AS (
  SELECT
    id,
    user_id,
    lower(summary || ' ' || COALESCE(description, '') || ' ' || array_to_string(labels, ' ')) as content
  FROM jira_issues
),
matches AS (
  SELECT
    jc.user_id,
    jc.id as jira_issue_id,
    tw.theme_key,
    CASE
      -- Count matching words
      WHEN (
        SELECT COUNT(*)
        FROM unnest(tw.words) w
        WHERE jc.content LIKE '%' || w || '%'
      ) >= 2 THEN 0.8  -- High confidence: 2+ words match
      WHEN (
        SELECT COUNT(*)
        FROM unnest(tw.words) w
        WHERE jc.content LIKE '%' || w || '%'
      ) = 1 AND array_length(tw.words, 1) = 1 THEN 0.6  -- Medium: single-word theme matches
      ELSE NULL  -- No match
    END as match_confidence
  FROM jira_content jc
  CROSS JOIN theme_word_list tw
  WHERE EXISTS (
    SELECT 1
    FROM unnest(tw.words) w
    WHERE jc.content LIKE '%' || w || '%'
  )
)
INSERT INTO theme_jira_links (
  user_id,
  jira_issue_id,
  theme_key,
  match_type,
  match_confidence
)
SELECT
  user_id,
  jira_issue_id,
  theme_key,
  'keyword',
  match_confidence
FROM matches
WHERE match_confidence IS NOT NULL
ON CONFLICT (jira_issue_id, theme_key) DO NOTHING;

-- Check results
SELECT
  'Backfill Complete' as status,
  COUNT(*) as total_links_created,
  COUNT(DISTINCT theme_key) as unique_themes,
  COUNT(DISTINCT jira_issue_id) as unique_jira_issues
FROM theme_jira_links;
