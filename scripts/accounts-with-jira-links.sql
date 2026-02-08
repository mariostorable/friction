-- Find accounts that have Jira links to test with
SELECT
  a.id,
  a.name,
  COUNT(DISTINCT ajl.jira_issue_id) as ticket_count,
  array_agg(DISTINCT ajl.match_type) as match_types
FROM accounts a
JOIN account_jira_links ajl ON ajl.account_id = a.id
GROUP BY a.id, a.name
ORDER BY ticket_count DESC
LIMIT 10;
