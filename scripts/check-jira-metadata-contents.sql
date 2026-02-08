-- Check what's actually in Jira metadata
-- Run this in Supabase SQL Editor

-- 1. Sample any Jira issues to see what metadata looks like
SELECT
  jira_key,
  summary,
  metadata
FROM jira_issues
LIMIT 5;

-- 2. Check if metadata is empty or null
SELECT
  COUNT(*) as total_issues,
  COUNT(*) FILTER (WHERE metadata IS NULL) as null_metadata,
  COUNT(*) FILTER (WHERE metadata = '{}') as empty_metadata,
  COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata != '{}') as has_metadata
FROM jira_issues;

-- 3. Check if there are any numeric values in metadata at all
SELECT
  jira_key,
  summary,
  metadata
FROM jira_issues
WHERE metadata::text ~ '\d+'
LIMIT 5;
