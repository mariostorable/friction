-- Get West Coast account ID first
WITH west_coast AS (
  SELECT id, name
  FROM accounts
  WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
    AND name = 'West Coast Self-Storage - CORP.'
)
-- Check if this account has ANY Jira links
SELECT 
  wc.name,
  ajl.match_type,
  ajl.match_confidence,
  COUNT(*) as link_count
FROM west_coast wc
LEFT JOIN account_jira_links ajl ON ajl.account_id = wc.id
GROUP BY wc.id, wc.name, ajl.match_type, ajl.match_confidence;

-- Get sample linked tickets for West Coast
WITH west_coast AS (
  SELECT id FROM accounts
  WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
    AND name = 'West Coast Self-Storage - CORP.'
)
SELECT 
  ji.jira_key,
  ji.summary,
  ji.status,
  ajl.match_type,
  ajl.match_confidence
FROM west_coast wc
JOIN account_jira_links ajl ON ajl.account_id = wc.id
JOIN jira_issues ji ON ji.id = ajl.jira_issue_id
LIMIT 10;
