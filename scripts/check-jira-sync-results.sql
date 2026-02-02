-- Check sync results
-- 1. How many Jira issues were synced?
SELECT COUNT(*) as total_jira_issues FROM jira_issues;

-- 2. How many theme links were created?
SELECT COUNT(*) as total_theme_links FROM theme_jira_links;

-- 3. How many account links were created?
SELECT COUNT(*) as total_account_links FROM account_jira_links;

-- 4. Sample of synced issues
SELECT
  jira_key,
  summary,
  status,
  components,
  labels
FROM jira_issues
LIMIT 5;

-- 5. Check if any account names appear in issue text
SELECT
  a.name as account_name,
  ji.jira_key,
  ji.summary
FROM accounts a
CROSS JOIN jira_issues ji
WHERE LOWER(ji.summary) LIKE '%' || LOWER(a.name) || '%'
   OR LOWER(ji.description) LIKE '%' || LOWER(a.name) || '%'
LIMIT 10;

-- 6. Check custom fields in metadata
SELECT
  jira_key,
  summary,
  metadata->'custom_fields' as custom_fields
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
LIMIT 3;
