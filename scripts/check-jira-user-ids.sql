-- Check which user IDs have Jira issues
SELECT
  user_id,
  COUNT(*) as issue_count
FROM jira_issues
GROUP BY user_id;

-- Check which user IDs have friction cards
SELECT
  user_id,
  COUNT(*) as card_count
FROM friction_cards
GROUP BY user_id;

-- Check if they match
SELECT
  'friction_cards' as table_name,
  user_id
FROM friction_cards
LIMIT 1
UNION ALL
SELECT
  'jira_issues' as table_name,
  user_id
FROM jira_issues
LIMIT 1;
