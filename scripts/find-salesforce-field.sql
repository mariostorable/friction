-- Find Salesforce ID field in Jira custom fields
-- This will show what custom fields exist in synced issues

-- 1. Get all unique custom field keys from jira_issues metadata
SELECT DISTINCT jsonb_object_keys(metadata->'custom_fields') as custom_field_key
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
ORDER BY custom_field_key;

-- 2. Sample custom fields data to see values
SELECT
  jira_key,
  summary,
  metadata->'custom_fields' as all_custom_fields
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
LIMIT 5;

-- 3. Search for Salesforce-related fields (case insensitive)
SELECT
  jira_key,
  summary,
  key as custom_field_key,
  value as custom_field_value
FROM jira_issues,
  jsonb_each_text(metadata->'custom_fields')
WHERE metadata->'custom_fields' IS NOT NULL
  AND (
    key ILIKE '%salesforce%' OR
    key ILIKE '%sfdc%' OR
    key ILIKE '%account%' OR
    key ILIKE '%customer%' OR
    value::text ILIKE '%salesforce%'
  )
LIMIT 20;

-- 4. Check if any custom field values match Salesforce Account IDs
SELECT
  ji.jira_key,
  ji.summary,
  a.name as account_name,
  a.salesforce_id,
  key as custom_field_key,
  value as custom_field_value
FROM jira_issues ji
CROSS JOIN accounts a,
  jsonb_each_text(ji.metadata->'custom_fields')
WHERE ji.metadata->'custom_fields' IS NOT NULL
  AND value::text = a.salesforce_id
LIMIT 10;
