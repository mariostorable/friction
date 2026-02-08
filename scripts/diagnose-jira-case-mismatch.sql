-- Diagnose why Jira sync found 0 account links
-- Run this in Supabase SQL Editor

-- 1. What case numbers exist in Jira custom fields?
SELECT
  key as jira_key,
  summary,
  custom_fields->>'customfield_17254' as salesforce_case_field,
  custom_fields
FROM jira_issues
WHERE custom_fields->>'customfield_17254' IS NOT NULL
  AND custom_fields->>'customfield_17254' != ''
LIMIT 10;

-- 2. Extract all case numbers from Jira (using regex to find 8-digit numbers)
SELECT DISTINCT
  key as jira_key,
  unnest(regexp_matches(custom_fields::text, '\b\d{8}\b', 'g')) as case_number_from_jira
FROM jira_issues
WHERE custom_fields::text ~ '\b\d{8}\b'
LIMIT 20;

-- 3. What case numbers exist in our friction cards?
SELECT DISTINCT
  ri.source_id as case_number_in_db
FROM raw_inputs ri
INNER JOIN friction_cards fc ON fc.raw_input_id = ri.id
WHERE ri.source_type = 'salesforce'
  AND ri.source_id ~ '^\d{8}$'
  AND fc.is_friction = true
ORDER BY ri.source_id DESC
LIMIT 20;

-- 4. Find case numbers that exist in BOTH Jira AND friction cards (this should show matches)
WITH jira_cases AS (
  SELECT DISTINCT
    unnest(regexp_matches(custom_fields::text, '\b\d{8}\b', 'g')) as case_number
  FROM jira_issues
  WHERE custom_fields::text ~ '\b\d{8}\b'
),
db_cases AS (
  SELECT DISTINCT ri.source_id as case_number
  FROM raw_inputs ri
  INNER JOIN friction_cards fc ON fc.raw_input_id = ri.id
  WHERE ri.source_type = 'salesforce'
    AND ri.source_id ~ '^\d{8}$'
    AND fc.is_friction = true
)
SELECT
  jira_cases.case_number,
  'Found in both!' as status
FROM jira_cases
INNER JOIN db_cases ON db_cases.case_number = jira_cases.case_number
LIMIT 10;
