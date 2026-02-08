-- Check what's actually in the custom fields of your Jira tickets
-- Run this in Supabase SQL Editor

-- Sample 10 Jira tickets and show ALL their custom field keys and values
SELECT
  jira_key,
  summary,
  jsonb_pretty(metadata->'custom_fields') as custom_fields_json
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
  AND jsonb_typeof(metadata->'custom_fields') = 'object'
  AND metadata->'custom_fields' != '{}'::jsonb
LIMIT 10;
