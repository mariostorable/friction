-- Check if Jira tickets are linked to friction themes
-- This will help diagnose why ticket counts aren't showing up

-- 1. Count of Jira tickets linked to each theme
SELECT
  theme_key,
  COUNT(*) as ticket_count,
  COUNT(*) FILTER (WHERE jira_issues.resolution_date IS NOT NULL) as resolved,
  COUNT(*) FILTER (WHERE jira_issues.resolution_date IS NULL AND
    (LOWER(jira_issues.status) LIKE '%progress%' OR
     LOWER(jira_issues.status) LIKE '%development%' OR
     LOWER(jira_issues.status) LIKE '%review%')) as in_progress,
  COUNT(*) FILTER (WHERE jira_issues.resolution_date IS NULL AND
    LOWER(jira_issues.status) NOT LIKE '%progress%' AND
    LOWER(jira_issues.status) NOT LIKE '%development%' AND
    LOWER(jira_issues.status) NOT LIKE '%review%') as open
FROM theme_jira_links
JOIN jira_issues ON theme_jira_links.jira_issue_id = jira_issues.id
GROUP BY theme_key
ORDER BY ticket_count DESC;

-- 2. Total Jira issues in database
SELECT COUNT(*) as total_jira_issues
FROM jira_issues;

-- 3. Total theme-jira links
SELECT COUNT(*) as total_theme_links
FROM theme_jira_links;

-- 4. Sample of Jira tickets with their themes
SELECT
  ji.jira_key,
  ji.summary,
  ji.status,
  ji.resolution_date,
  STRING_AGG(tjl.theme_key, ', ') as linked_themes,
  STRING_AGG(tjl.match_type, ', ') as match_types
FROM jira_issues ji
LEFT JOIN theme_jira_links tjl ON tjl.jira_issue_id = ji.id
GROUP BY ji.id, ji.jira_key, ji.summary, ji.status, ji.resolution_date
ORDER BY ji.updated_date DESC
LIMIT 20;

-- 5. Themes with NO Jira tickets linked
SELECT DISTINCT theme_key
FROM friction_cards
WHERE theme_key NOT IN (
  SELECT DISTINCT theme_key
  FROM theme_jira_links
)
ORDER BY theme_key;
