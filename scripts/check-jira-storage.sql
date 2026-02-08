-- Check what's actually in jira_issues table
-- Run this in Supabase SQL Editor

-- 1. Count total Jira issues
SELECT COUNT(*) as total_jira_issues
FROM jira_issues;

-- 2. Count issues with custom fields
SELECT COUNT(*) as issues_with_custom_fields
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
  AND jsonb_typeof(metadata->'custom_fields') = 'object'
  AND metadata->'custom_fields' != '{}'::jsonb;

-- 3. Sample custom field keys
SELECT
  jira_key,
  jsonb_object_keys(metadata->'custom_fields') as custom_field_key
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
  AND jsonb_typeof(metadata->'custom_fields') = 'object'
LIMIT 20;

-- 4. Look for fields that might contain Case IDs
SELECT
  jira_key,
  key as custom_field_name,
  value as custom_field_value
FROM jira_issues,
     jsonb_each_text(metadata->'custom_fields')
WHERE metadata->'custom_fields' IS NOT NULL
  AND (
    value::text ~* '500[a-zA-Z0-9]{12,15}' OR  -- Looks like Case ID
    key::text ~* 'case|salesforce|account'      -- Field name suggests Case/Account
  )
LIMIT 20;

-- 5. Check account_jira_links (first check what columns exist)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'account_jira_links'
ORDER BY ordinal_position;

-- Then count the links (using correct column names)
SELECT COUNT(*) as total_account_links,
       COUNT(DISTINCT account_id) as unique_accounts_linked
FROM account_jira_links;
