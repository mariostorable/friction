-- See what accounts are in Jira issues
SELECT 
  jira_key,
  summary,
  status,
  created_date
FROM jira_issues
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
ORDER BY created_date DESC
LIMIT 20;

-- Check account-jira link stats
SELECT 
  COUNT(DISTINCT account_id) as unique_accounts_with_links,
  COUNT(*) as total_links,
  match_type,
  AVG(match_confidence) as avg_confidence
FROM account_jira_links
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
GROUP BY match_type;
