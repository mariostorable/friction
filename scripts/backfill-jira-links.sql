-- =====================================================================
-- BACKFILL: Create theme links for all existing Jira issues
-- =====================================================================
-- This creates links for Jira issues that were synced before the fix
-- Run this ONE TIME in Supabase SQL Editor
-- =====================================================================

-- Strategy: Keyword matching based on actual friction themes
-- Matches Jira ticket content (summary + description + labels) against theme keywords

INSERT INTO theme_jira_links (
  user_id,
  jira_issue_id,
  theme_key,
  match_type,
  match_confidence
)
SELECT DISTINCT
  ji.user_id,
  ji.id as jira_issue_id,
  fc.theme_key,
  'keyword' as match_type,
  0.8 as match_confidence
FROM jira_issues ji
CROSS JOIN (
  SELECT DISTINCT theme_key
  FROM friction_cards
  WHERE is_friction = true
) fc
WHERE
  -- Match if Jira ticket content contains theme keywords
  -- Split theme_key by underscore and check if words appear in ticket
  (
    -- Get first word of theme (e.g., "billing" from "billing_confusion")
    lower(ji.summary || ' ' || COALESCE(ji.description, '') || ' ' || array_to_string(ji.labels, ' '))
    LIKE '%' || split_part(fc.theme_key, '_', 1) || '%'
  )
  OR
  (
    -- Also check second word if it exists
    split_part(fc.theme_key, '_', 2) != ''
    AND lower(ji.summary || ' ' || COALESCE(ji.description, '') || ' ' || array_to_string(ji.labels, ' '))
    LIKE '%' || split_part(fc.theme_key, '_', 2) || '%'
  )
ON CONFLICT (jira_issue_id, theme_key) DO NOTHING
RETURNING *;

-- Expected: Should create hundreds of links based on keyword matches
-- The query will return the created links (may take 10-30 seconds)
