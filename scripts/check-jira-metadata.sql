-- Check if Jira issues have any metadata at all
-- Run this in Supabase SQL Editor

-- 1. Count issues with any metadata
SELECT
  COUNT(*) FILTER (WHERE metadata IS NOT NULL) as has_metadata,
  COUNT(*) FILTER (WHERE metadata IS NULL) as no_metadata,
  COUNT(*) as total
FROM jira_issues;

-- 2. Sample raw metadata from 3 issues
SELECT
  jira_key,
  summary,
  metadata
FROM jira_issues
LIMIT 3;

-- 3. Check if metadata->custom_fields exists but is empty
SELECT
  COUNT(*) FILTER (WHERE metadata->'custom_fields' IS NULL) as custom_fields_null,
  COUNT(*) FILTER (WHERE metadata->'custom_fields' = '{}'::jsonb) as custom_fields_empty,
  COUNT(*) FILTER (WHERE metadata->'custom_fields' IS NOT NULL AND metadata->'custom_fields' != '{}'::jsonb) as custom_fields_has_data,
  COUNT(*) as total
FROM jira_issues;
