-- Count total Jira issues
SELECT 
  COUNT(*) as total_jira_issues,
  COUNT(DISTINCT jira_key) as unique_tickets,
  MAX(created_date) as newest_ticket,
  MIN(created_date) as oldest_ticket
FROM jira_issues
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9';

-- Sample some Jira keys
SELECT jira_key, summary, created_date
FROM jira_issues
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
ORDER BY created_date DESC
LIMIT 5;
