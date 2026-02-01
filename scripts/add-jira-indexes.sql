-- Add indexes for Jira roadmap queries
-- These indexes improve performance for account-specific Jira status queries

-- Index for filtering jira_issues by resolution_date (for "recently resolved" queries)
CREATE INDEX IF NOT EXISTS idx_jira_issues_resolution_date
ON jira_issues(resolution_date DESC)
WHERE resolution_date IS NOT NULL;

-- Index for filtering jira_issues by updated_date and user_id
CREATE INDEX IF NOT EXISTS idx_jira_issues_user_updated
ON jira_issues(user_id, updated_date DESC);

-- Index for filtering jira_issues by status (for "in progress" vs "on radar")
CREATE INDEX IF NOT EXISTS idx_jira_issues_status
ON jira_issues(user_id, status);

-- Index for joining theme_jira_links to jira_issues
CREATE INDEX IF NOT EXISTS idx_theme_jira_links_jira_issue_id
ON theme_jira_links(jira_issue_id);

-- Index for filtering theme_jira_links by theme_key
CREATE INDEX IF NOT EXISTS idx_theme_jira_links_theme_key
ON theme_jira_links(theme_key);

-- Composite index for theme_jira_links queries
CREATE INDEX IF NOT EXISTS idx_theme_jira_links_composite
ON theme_jira_links(theme_key, match_confidence DESC);

-- Index for case_themes queries (to find themes by account)
CREATE INDEX IF NOT EXISTS idx_case_themes_case_id
ON case_themes(case_id);

-- Verify indexes were created
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE 'idx_jira%' OR indexname LIKE '%theme%'
ORDER BY tablename, indexname;
