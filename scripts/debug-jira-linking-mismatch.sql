-- ===================================================================
-- Debug: Why aren't Jira tickets linking to themes?
-- Compare actual theme keys vs Jira content to identify mismatch
-- ===================================================================

-- 1. Show actual friction theme keys (what we're trying to match against)
SELECT
  'Actual Friction Themes' as diagnostic,
  theme_key,
  COUNT(*) as card_count
FROM friction_cards
WHERE is_friction = true
GROUP BY theme_key
ORDER BY card_count DESC;

-- 2. Show sample Jira tickets with their text content
SELECT
  'Sample Jira Tickets' as diagnostic,
  jira_key,
  LEFT(summary, 80) as summary_sample,
  array_length(labels, 1) as label_count,
  labels
FROM jira_issues
ORDER BY created_date DESC
LIMIT 10;

-- 3. Test keyword matching manually
-- See if ANY Jira issue text would match ANY theme key
WITH theme_words AS (
  SELECT DISTINCT
    theme_key,
    word
  FROM (
    SELECT DISTINCT theme_key
    FROM friction_cards
    WHERE is_friction = true
  ) themes,
  LATERAL unnest(string_to_array(lower(theme_key), '_')) as word
  WHERE length(word) > 3
),
jira_content AS (
  SELECT
    jira_key,
    lower(summary || ' ' || COALESCE(description, '') || ' ' || array_to_string(labels, ' ')) as full_text
  FROM jira_issues
  LIMIT 100
)
SELECT
  'Keyword Match Test' as diagnostic,
  COUNT(DISTINCT jc.jira_key) as jira_tickets_that_match,
  COUNT(DISTINCT tw.theme_key) as themes_matched,
  string_agg(DISTINCT tw.theme_key, ', ') as sample_matched_themes
FROM jira_content jc
CROSS JOIN theme_words tw
WHERE jc.full_text LIKE '%' || tw.word || '%';

-- 4. Check if Case IDs in Jira metadata match Case IDs in friction_cards
WITH jira_case_ids AS (
  SELECT
    id as jira_issue_id,
    jira_key,
    (metadata->'custom_fields')::text as custom_fields_text
  FROM jira_issues
  WHERE (metadata->'custom_fields')::text ~ '\d{8}'
  LIMIT 20
),
extracted_cases AS (
  SELECT
    jira_issue_id,
    jira_key,
    regexp_matches(custom_fields_text, '\d{8}', 'g') as case_number_array
  FROM jira_case_ids
),
case_matches AS (
  SELECT
    ec.jira_key,
    ec.case_number_array[1] as case_number,
    ri.source_id as matching_source_id,
    fc.theme_key,
    fc.account_id
  FROM extracted_cases ec
  LEFT JOIN raw_inputs ri ON ri.source_id = ec.case_number_array[1]
  LEFT JOIN friction_cards fc ON fc.raw_input_id = ri.id AND fc.is_friction = true
  WHERE ri.source_type = 'salesforce'
)
SELECT
  'Case ID Matching Test' as diagnostic,
  COUNT(*) as total_jira_with_case_ids,
  COUNT(DISTINCT matching_source_id) as case_ids_found_in_db,
  COUNT(DISTINCT theme_key) as themes_found,
  string_agg(DISTINCT jira_key || '→' || COALESCE(theme_key, 'NO_MATCH'), ', ') as sample_matches
FROM case_matches;

-- 5. Check a specific example: Show one Jira ticket with case ID and see if we can trace it
SELECT
  'Detailed Example' as diagnostic,
  ji.jira_key,
  ji.summary,
  (ji.metadata->'custom_fields')::jsonb as custom_fields,
  (ji.metadata->'custom_fields')::text ~ '\d{8}' as has_8_digit_number,
  regexp_matches((ji.metadata->'custom_fields')::text, '\d{8}', 'g') as extracted_case_numbers
FROM jira_issues ji
WHERE (ji.metadata->'custom_fields')::text ~ '\d{8}'
LIMIT 1;
