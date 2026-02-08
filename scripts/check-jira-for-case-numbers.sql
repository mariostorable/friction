-- Find Jira tickets that might have Salesforce case numbers in metadata
-- This helps diagnose why salesforce_case matching isn't working

-- 1. Check what's in the metadata field
SELECT
  jira_key,
  summary,
  metadata::text as metadata_text,
  length(metadata::text) as metadata_length
FROM jira_issues
WHERE metadata IS NOT NULL
  AND metadata != '{}'
LIMIT 10;

-- 2. Search for patterns that look like case numbers (8 digits)
SELECT
  jira_key,
  summary,
  metadata
FROM jira_issues
WHERE metadata::text ~ '\d{8}'  -- Look for 8-digit numbers
LIMIT 10;

-- 3. Check description field for case numbers
SELECT
  jira_key,
  summary,
  description,
  CASE
    WHEN description ~ 'Case[: #]*\d{8}' THEN 'Has case pattern'
    WHEN description ~ '\d{8}' THEN 'Has 8 digits'
    ELSE 'No pattern'
  END as pattern_check
FROM jira_issues
WHERE description IS NOT NULL
  AND (
    description ~ 'Case[: #]*\d{8}'
    OR description ~ 'SF[- ]*\d{8}'
    OR description ~ 'Salesforce.*\d{8}'
  )
LIMIT 20;

-- 4. Check if ANY Jira tickets have been linked via salesforce_case match type
SELECT COUNT(*) as salesforce_case_links
FROM account_jira_links
WHERE match_type = 'salesforce_case';

-- 5. See what case numbers we have in Salesforce (for comparison)
SELECT
  source_id as case_number,
  account_id,
  created_at
FROM raw_inputs
WHERE source_type = 'salesforce_case'
  AND source_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
