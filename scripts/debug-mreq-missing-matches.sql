-- Debug why MREQ-6988, MREQ-7408, MREQ-7442 didn't match Salesforce cases

-- Step 1: Check what case IDs are in customfield_17254 for these MREQ tickets
SELECT
  jira_key,
  summary,
  metadata->'custom_fields'->>'customfield_17254' as customfield_17254_raw,
  metadata->'custom_fields' as all_custom_fields
FROM jira_issues
WHERE jira_key IN ('MREQ-6988', 'MREQ-7408', 'MREQ-7442')
ORDER BY jira_key;

-- Step 2: Check if the case IDs we expect (03690227, 03732752) exist in friction_cards
SELECT
  ri.source_id as salesforce_case_id,
  fc.is_friction,
  fc.account_id,
  a.name as account_name,
  fc.theme_key
FROM raw_inputs ri
JOIN friction_cards fc ON fc.raw_input_id = ri.id
LEFT JOIN accounts a ON a.id = fc.account_id
WHERE ri.source_id IN ('03690227', '03732752', '03719088')
  AND ri.source_type = 'salesforce'
ORDER BY ri.source_id;

-- Step 3: Count total Salesforce cases with source_type='salesforce'
SELECT
  COUNT(DISTINCT ri.source_id) as total_unique_case_ids,
  COUNT(*) FILTER (WHERE fc.is_friction = true) as friction_cases,
  COUNT(*) FILTER (WHERE fc.is_friction = false) as non_friction_cases
FROM raw_inputs ri
JOIN friction_cards fc ON fc.raw_input_id = ri.id
WHERE ri.source_type = 'salesforce'
  AND ri.source_id IS NOT NULL;

-- Step 4: Check account_jira_links with match_type='salesforce_case'
SELECT
  COUNT(*) as salesforce_case_links,
  COUNT(DISTINCT account_id) as unique_accounts,
  COUNT(DISTINCT jira_issue_id) as unique_jira_tickets
FROM account_jira_links
WHERE match_type = 'salesforce_case';
