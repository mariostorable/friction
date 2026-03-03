-- Backfill account_jira_links for tickets that have customfield_12184
-- but no existing account link. Uses client_name_aliases table for mapping.
-- Run this in Supabase SQL Editor after confirming the alias table is correct.

INSERT INTO account_jira_links (user_id, account_id, jira_issue_id, match_type, match_confidence)
SELECT DISTINCT
  ji.user_id,
  a.id AS account_id,
  ji.id AS jira_issue_id,
  'client_field' AS match_type,
  0.85 AS match_confidence
FROM jira_issues ji
-- Expand multi-value client field (comma or semicolon separated)
CROSS JOIN LATERAL (
  SELECT TRIM(unnest(string_to_array(
    REPLACE(ji.metadata->'custom_fields'->>'customfield_12184', ';', ','),
    ','
  ))) AS client_name
) AS cf
JOIN client_name_aliases cna
  ON LOWER(cf.client_name) = LOWER(cna.jira_short_name)
  AND cna.sf_account_name IS NOT NULL
JOIN accounts a
  ON LOWER(a.name) = LOWER(cna.sf_account_name)
  AND a.user_id = ji.user_id
  AND a.status = 'active'
WHERE ji.metadata->'custom_fields'->>'customfield_12184' IS NOT NULL
  -- Only insert if no link already exists for this (account, issue) pair
  AND NOT EXISTS (
    SELECT 1 FROM account_jira_links ajl
    WHERE ajl.jira_issue_id = ji.id
      AND ajl.account_id = a.id
  )
ON CONFLICT (account_id, jira_issue_id) DO NOTHING;
