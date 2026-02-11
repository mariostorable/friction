-- Diagnose why West Coast tickets aren't showing
-- Mario's user_id: ab953672-7bad-4601-9289-5d766e73fec9

-- Query 1: Check if West Coast account exists
SELECT 
  'Account Check' as query,
  id,
  name,
  salesforce_id
FROM accounts
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND name ILIKE '%west coast%';

-- Query 2: Check for Jira issues mentioning West Coast
SELECT 
  'Jira Issues Mentioning West Coast' as query,
  jira_key,
  summary,
  status,
  created_date
FROM jira_issues
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND (summary ILIKE '%west coast%' OR description ILIKE '%west coast%')
ORDER BY created_date DESC
LIMIT 10;

-- Query 3: Check account-jira links for West Coast
SELECT 
  'Account-Jira Links for West Coast' as query,
  COUNT(*) as link_count,
  match_type,
  AVG(match_confidence) as avg_confidence
FROM account_jira_links ajl
JOIN accounts a ON ajl.account_id = a.id
WHERE a.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND a.name ILIKE '%west coast%'
GROUP BY match_type;

-- Query 4: Check theme-jira links that might be for West Coast
SELECT 
  'Theme Links for West Coast Issues' as query,
  tjl.theme_key,
  COUNT(*) as count
FROM theme_jira_links tjl
JOIN jira_issues ji ON tjl.jira_issue_id = ji.id
WHERE ji.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND (ji.summary ILIKE '%west coast%' OR ji.description ILIKE '%west coast%')
GROUP BY tjl.theme_key;

-- Query 5: Check Jira integration status
SELECT
  'Jira Integration Status' as query,
  status,
  last_synced_at,
  error_message
FROM integrations
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND integration_type = 'jira';
