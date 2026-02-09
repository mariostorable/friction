-- Verify that account_jira_links were created for the MREQ tickets
-- These tickets should now link via salesforce_case match_type

-- Check if MREQ tickets are linked
SELECT
  ji.jira_key,
  ji.summary,
  ajl.match_type,
  ajl.match_confidence,
  a.name as account_name
FROM jira_issues ji
LEFT JOIN account_jira_links ajl ON ajl.jira_issue_id = ji.id
LEFT JOIN accounts a ON a.id = ajl.account_id
WHERE ji.jira_key LIKE 'MREQ-%'
ORDER BY ji.jira_key;

-- Count account links by match type
SELECT
  match_type,
  COUNT(*) as link_count
FROM account_jira_links
GROUP BY match_type
ORDER BY link_count DESC;

-- Check specific MREQ tickets we identified
SELECT
  ji.jira_key,
  ji.summary,
  ajl.match_type,
  a.name as account_name,
  ji.metadata->'custom_fields'->>'customfield_17254' as salesforce_cases
FROM jira_issues ji
LEFT JOIN account_jira_links ajl ON ajl.jira_issue_id = ji.id
LEFT JOIN accounts a ON a.id = ajl.account_id
WHERE ji.jira_key IN ('MREQ-6988', 'MREQ-7408', 'MREQ-7442', 'MREQ-7629')
ORDER BY ji.jira_key;
