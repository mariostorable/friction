-- ============================================================================
-- Migration: Add get_theme_link_stats Function
-- Date: 2026-02-09
-- Purpose: Provide diagnostic stats for Jira theme linking
-- ============================================================================

-- Function to get theme link statistics for diagnostics
CREATE OR REPLACE FUNCTION get_theme_link_stats()
RETURNS TABLE (
  theme_key TEXT,
  ticket_count BIGINT,
  resolved BIGINT,
  in_progress BIGINT,
  open BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tl.theme_key,
    COUNT(DISTINCT tl.jira_issue_id)::BIGINT as ticket_count,
    COUNT(DISTINCT CASE
      WHEN ji.status IN ('Done', 'Resolved', 'Closed', 'Complete', 'Completed')
      THEN tl.jira_issue_id
    END)::BIGINT as resolved,
    COUNT(DISTINCT CASE
      WHEN ji.status IN ('In Progress', 'In Development', 'In Review', 'Testing')
      THEN tl.jira_issue_id
    END)::BIGINT as in_progress,
    COUNT(DISTINCT CASE
      WHEN ji.status NOT IN ('Done', 'Resolved', 'Closed', 'Complete', 'Completed', 'In Progress', 'In Development', 'In Review', 'Testing')
      THEN tl.jira_issue_id
    END)::BIGINT as open
  FROM theme_jira_links tl
  INNER JOIN jira_issues ji ON tl.jira_issue_id = ji.id
  WHERE tl.theme_key IS NOT NULL
  GROUP BY tl.theme_key
  ORDER BY ticket_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_theme_link_stats IS 'Get statistics on Jira tickets linked to friction themes, grouped by theme with status breakdown';

-- ============================================================================
-- Migration Complete
-- ============================================================================
