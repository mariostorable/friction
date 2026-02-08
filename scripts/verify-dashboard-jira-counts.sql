-- Verify Jira ticket counts that should appear in dashboard table
-- This shows what the dashboard will display after the fix deploys

SELECT
  a.id as account_id,
  a.name as account_name,

  -- Count resolved in last 30 days
  COUNT(*) FILTER (
    WHERE ji.resolution_date IS NOT NULL
    AND ji.resolution_date >= NOW() - INTERVAL '30 days'
  ) as resolved_30d,

  -- Count in progress (development/review status)
  COUNT(*) FILTER (
    WHERE ji.resolution_date IS NULL
    AND (
      LOWER(ji.status) LIKE '%progress%'
      OR LOWER(ji.status) LIKE '%development%'
      OR LOWER(ji.status) LIKE '%review%'
    )
  ) as in_progress,

  -- Count open (not resolved, not in progress)
  COUNT(*) FILTER (
    WHERE ji.resolution_date IS NULL
    AND NOT (
      LOWER(ji.status) LIKE '%progress%'
      OR LOWER(ji.status) LIKE '%development%'
      OR LOWER(ji.status) LIKE '%review%'
    )
  ) as open,

  -- Total tickets linked
  COUNT(*) as total_tickets,

  -- Show match types used
  array_agg(DISTINCT ajl.match_type) as match_types

FROM accounts a
LEFT JOIN account_jira_links ajl ON ajl.account_id = a.id
LEFT JOIN jira_issues ji ON ji.id = ajl.jira_issue_id
WHERE a.status = 'active'
GROUP BY a.id, a.name
HAVING COUNT(*) > 0  -- Only accounts with tickets
ORDER BY total_tickets DESC, a.name
LIMIT 20;
