-- Comprehensive diagnostic for Jira-Theme linking
-- This will show why most themes don't have Jira tickets linked

-- 1. All themes in the system (from friction_cards)
SELECT
  theme_key,
  COUNT(*) as friction_card_count
FROM friction_cards
GROUP BY theme_key
ORDER BY friction_card_count DESC;

-- 2. Themes WITH Jira tickets linked
SELECT
  theme_key,
  COUNT(*) as ticket_count
FROM theme_jira_links
GROUP BY theme_key
ORDER BY ticket_count DESC;

-- 3. Themes WITHOUT any Jira tickets (the gap)
SELECT DISTINCT theme_key
FROM friction_cards
WHERE theme_key NOT IN (
  SELECT DISTINCT theme_key
  FROM theme_jira_links
)
ORDER BY theme_key;

-- 4. Sample Jira tickets and their labels/keywords
SELECT
  jira_key,
  summary,
  status,
  labels,
  ARRAY_TO_STRING(labels, ', ') as labels_string
FROM jira_issues
ORDER BY updated_date DESC
LIMIT 20;

-- 5. See how tickets are being matched to themes
SELECT
  tjl.theme_key,
  tjl.match_type,
  COUNT(*) as match_count
FROM theme_jira_links tjl
GROUP BY tjl.theme_key, tjl.match_type
ORDER BY tjl.theme_key, match_count DESC;

-- 6. Detailed view of what got linked
SELECT
  ji.jira_key,
  ji.summary,
  ji.labels,
  tjl.theme_key,
  tjl.match_type,
  tjl.matched_keyword
FROM jira_issues ji
JOIN theme_jira_links tjl ON tjl.jira_issue_id = ji.id
ORDER BY tjl.theme_key, ji.jira_key;
