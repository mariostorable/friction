-- Check if there are storage-related Jira tickets with Salesforce case numbers

-- Step 1: Check what Jira projects exist
SELECT
  LEFT(jira_key, POSITION('-' IN jira_key) - 1) as project_key,
  COUNT(*) as ticket_count,
  COUNT(*) FILTER (WHERE metadata->'custom_fields'->>'customfield_17254' IS NOT NULL) as has_customfield_17254
FROM jira_issues
WHERE user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
GROUP BY project_key
ORDER BY ticket_count DESC;

-- Step 2: Check matched tickets - what accounts are they linked to?
SELECT
  ji.jira_key,
  LEFT(ji.jira_key, POSITION('-' IN ji.jira_key) - 1) as project_key,
  a.name as account_name,
  a.business_unit
FROM jira_issues ji
JOIN account_jira_links ajl ON ajl.jira_issue_id = ji.id
JOIN accounts a ON a.id = ajl.account_id
WHERE ajl.match_type = 'salesforce_case'
  AND ji.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
ORDER BY ji.jira_key;

-- Step 3: Check if any storage accounts have Salesforce cases
SELECT
  a.name as account_name,
  a.business_unit,
  COUNT(DISTINCT fc.id) as friction_cards,
  COUNT(DISTINCT ri.source_id) as unique_case_ids
FROM accounts a
JOIN friction_cards fc ON fc.account_id = a.id
JOIN raw_inputs ri ON ri.id = fc.raw_input_id
WHERE ri.source_type = 'salesforce'
  AND fc.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
GROUP BY a.id, a.name, a.business_unit
HAVING a.business_unit = 'storage'
ORDER BY friction_cards DESC
LIMIT 10;

-- Step 4: Sample some storage Salesforce case IDs
SELECT DISTINCT
  ri.source_id as salesforce_case_id,
  a.name as account_name
FROM raw_inputs ri
JOIN friction_cards fc ON fc.raw_input_id = ri.id
JOIN accounts a ON a.id = fc.account_id
WHERE ri.source_type = 'salesforce'
  AND fc.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
  AND a.business_unit = 'storage'
LIMIT 20;
