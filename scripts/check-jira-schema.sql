-- Check jira_issues table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'jira_issues'
ORDER BY ordinal_position;
