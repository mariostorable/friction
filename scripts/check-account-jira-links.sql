-- Check if there are any account-jira links
SELECT
  ajl.jira_key,
  a.name as account_name,
  ji.summary,
  ji.status
FROM account_jira_links ajl
LEFT JOIN accounts a ON a.id = ajl.account_id
LEFT JOIN jira_issues ji ON ji.jira_key = ajl.jira_key
LIMIT 10;

-- Also check how many jira issues exist
SELECT COUNT(*) as total_jira_issues FROM jira_issues;

-- Check how many account links exist
SELECT COUNT(*) as total_account_links FROM account_jira_links;
