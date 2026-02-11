-- Find which custom field contains Client(s) information
-- We're looking for fields that contain known account names

-- First, let's see all unique custom field keys across all tickets
SELECT DISTINCT jsonb_object_keys(metadata->'custom_fields') as field_key
FROM jira_issues
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND metadata->'custom_fields' IS NOT NULL
  AND metadata->'custom_fields' != '{}'::jsonb
ORDER BY field_key;

-- Now let's check specific tickets like EDGE-4200 to see what custom fields they have
SELECT
  jira_key,
  summary,
  jsonb_pretty(metadata->'custom_fields') as custom_fields
FROM jira_issues
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND jira_key = 'EDGE-4200';

-- Search for custom fields that might contain "White Label", "StorageMart", etc.
-- Check all custom fields for account-related values
WITH field_values AS (
  SELECT
    jira_key,
    summary,
    jsonb_each_text(metadata->'custom_fields') as field_pair
  FROM jira_issues
  WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
    AND metadata->'custom_fields' IS NOT NULL
)
SELECT
  (field_pair).key as field_name,
  (field_pair).value as field_value,
  jira_key,
  summary
FROM field_values
WHERE (field_pair).value ILIKE '%White Label%'
   OR (field_pair).value ILIKE '%StorageMart%'
   OR (field_pair).value ILIKE '%West Coast%'
   OR (field_pair).value ILIKE '%Marine%'
   OR (field_pair).value ILIKE '%Client%'
LIMIT 50;
