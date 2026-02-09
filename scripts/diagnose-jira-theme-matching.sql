-- ===================================================================
-- Diagnostic: Why aren't Jira tickets linking to friction themes?
-- ===================================================================

-- 1. Check if we have friction themes at all
SELECT
  'Friction Themes' as check_name,
  COUNT(DISTINCT theme_key) as count,
  string_agg(DISTINCT theme_key, ', ' ORDER BY theme_key) as sample_themes
FROM friction_cards
WHERE is_friction = true;

-- 2. Check sample Jira ticket data
SELECT
  'Sample Jira Tickets' as check_name,
  jira_key,
  LEFT(summary, 100) as summary_preview,
  status,
  array_length(labels, 1) as label_count,
  labels,
  (metadata->>'custom_fields')::jsonb ? 'customfield_17254' as has_salesforce_case_field
FROM jira_issues
ORDER BY created_date DESC
LIMIT 5;

-- 3. Check if any Jira tickets have Salesforce Case IDs in custom fields
SELECT
  'Jira with Salesforce Cases' as check_name,
  COUNT(*) as count_with_case_refs
FROM jira_issues
WHERE
  metadata::text ~* '\d{8}' -- Contains 8-digit case numbers
  OR metadata::text ~* '500[a-zA-Z0-9]{12}'; -- Contains Salesforce IDs

-- 4. Check keyword overlap between Jira and themes
WITH theme_words AS (
  SELECT
    DISTINCT unnest(string_to_array(theme_key, '_')) as word
  FROM friction_cards
  WHERE is_friction = true
    AND length(unnest(string_to_array(theme_key, '_'))) > 3
),
jira_words AS (
  SELECT DISTINCT word
  FROM jira_issues,
       LATERAL regexp_split_to_table(lower(summary || ' ' || COALESCE(description, '')), '\W+') as word
  WHERE length(word) > 3
  LIMIT 100 -- Sample for performance
)
SELECT
  'Potential Keyword Matches' as check_name,
  COUNT(*) as common_words,
  string_agg(tw.word, ', ' ORDER BY tw.word) as sample_matches
FROM theme_words tw
INNER JOIN jira_words jw ON tw.word = jw.word;

-- 5. Check friction cards with source_id (Salesforce Cases)
SELECT
  'Friction Cards with Salesforce Cases' as check_name,
  COUNT(DISTINCT fc.id) as friction_cards_with_cases,
  COUNT(DISTINCT ri.source_id) as unique_case_ids,
  string_agg(DISTINCT LEFT(ri.source_id, 10), ', ') as sample_case_ids
FROM friction_cards fc
INNER JOIN raw_inputs ri ON fc.raw_input_id = ri.id
WHERE fc.is_friction = true
  AND ri.source_type = 'salesforce'
  AND ri.source_id IS NOT NULL;

-- 6. Check if theme_jira_links table exists and has data
SELECT
  'Theme Jira Links Status' as check_name,
  COUNT(*) as total_links,
  COUNT(DISTINCT theme_key) as unique_themes_linked,
  COUNT(DISTINCT jira_issue_id) as unique_jira_issues_linked
FROM theme_jira_links;

-- 7. Try manual keyword matching (simulate the sync logic)
SELECT
  'Manual Keyword Match Test' as check_name,
  ji.jira_key,
  ji.summary,
  fc.theme_key,
  'Matched!' as status
FROM jira_issues ji
CROSS JOIN (
  SELECT DISTINCT theme_key
  FROM friction_cards
  WHERE is_friction = true
  LIMIT 10
) fc
WHERE
  -- Simulate keyword matching logic
  lower(ji.summary || ' ' || COALESCE(ji.description, '') || ' ' || array_to_string(ji.labels, ' '))
  LIKE '%' || replace(split_part(fc.theme_key, '_', 1), '_', '%') || '%'
LIMIT 10;
