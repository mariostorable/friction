-- Check what's actually in your Jira tickets to understand why matching isn't working

-- 1. Sample of Jira tickets with their labels
SELECT
  jira_key,
  summary,
  labels,
  ARRAY_TO_STRING(labels, ', ') as labels_as_text
FROM jira_issues
ORDER BY updated_date DESC
LIMIT 20;

-- 2. All unique labels used across Jira tickets
SELECT
  UNNEST(labels) as label,
  COUNT(*) as ticket_count
FROM jira_issues
WHERE labels IS NOT NULL AND ARRAY_LENGTH(labels, 1) > 0
GROUP BY label
ORDER BY ticket_count DESC;

-- 3. Check which tickets got linked and why
SELECT
  ji.jira_key,
  ji.summary,
  ji.labels,
  tjl.theme_key,
  tjl.match_type,
  tjl.match_confidence
FROM jira_issues ji
JOIN theme_jira_links tjl ON tjl.jira_issue_id = ji.id
ORDER BY tjl.theme_key, ji.jira_key;

-- 4. Count of tickets with NO theme links
SELECT COUNT(*) as unlinked_tickets
FROM jira_issues ji
WHERE NOT EXISTS (
  SELECT 1 FROM theme_jira_links tjl
  WHERE tjl.jira_issue_id = ji.id
);

-- 5. Sample of unlinked tickets
SELECT
  jira_key,
  summary,
  labels,
  status
FROM jira_issues ji
WHERE NOT EXISTS (
  SELECT 1 FROM theme_jira_links tjl
  WHERE tjl.jira_issue_id = ji.id
)
ORDER BY updated_date DESC
LIMIT 10;
