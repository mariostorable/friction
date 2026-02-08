-- Check what's actually in custom_fields after latest sync
-- Run this in Supabase SQL Editor

-- 1. Check if ANY issues have non-empty custom_fields
SELECT
  COUNT(*) FILTER (WHERE metadata->'custom_fields' IS NULL) as null_count,
  COUNT(*) FILTER (WHERE metadata->'custom_fields' = '{}'::jsonb) as empty_count,
  COUNT(*) FILTER (WHERE jsonb_typeof(metadata->'custom_fields') = 'object'
                   AND metadata->'custom_fields' != '{}'::jsonb) as has_data_count
FROM jira_issues;

-- 2. Sample 3 issues with their custom_fields to see what's stored
SELECT
  jira_key,
  summary,
  metadata->'custom_fields' as custom_fields,
  jsonb_object_keys(metadata->'custom_fields') as field_keys
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
  AND metadata->'custom_fields' != '{}'::jsonb
LIMIT 3;

-- 3. If all are empty, show sample of full metadata
SELECT
  jira_key,
  summary,
  metadata
FROM jira_issues
ORDER BY updated_date DESC
LIMIT 2;
