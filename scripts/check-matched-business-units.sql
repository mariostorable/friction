-- Check business units of matched accounts
SELECT
  ji.jira_key,
  LEFT(ji.jira_key, POSITION('-' IN ji.jira_key) - 1) as project_key,
  a.name as account_name,
  a.business_unit
FROM jira_issues ji
JOIN account_jira_links ajl ON ajl.jira_issue_id = ji.id
JOIN accounts a ON a.id = ajl.account_id
WHERE ajl.match_type = 'salesforce_case'
  AND ji.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
ORDER BY ji.jira_key;
