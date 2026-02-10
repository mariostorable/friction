-- =====================================================================
-- TEST: Manual Insert - Can we create a link manually?
-- =====================================================================
-- Run this SEPARATELY after the all-in-one diagnostic
-- This will show if the database itself can accept inserts
-- =====================================================================

-- Try to insert a test link
INSERT INTO theme_jira_links (
  user_id,
  jira_issue_id,
  theme_key,
  match_type,
  match_confidence
)
SELECT
  user_id,
  id,
  'access_permissions',
  'manual',
  0.9
FROM jira_issues
WHERE summary ILIKE '%password%' OR summary ILIKE '%login%' OR summary ILIKE '%access%'
LIMIT 1
ON CONFLICT DO NOTHING
RETURNING *;

-- If you see a row returned above, the insert SUCCEEDED
-- If you see an error, that's the problem we need to fix
-- If you see "Success. No rows returned", it means the link already existed
