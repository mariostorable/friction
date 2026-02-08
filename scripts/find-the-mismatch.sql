-- FIND THE MISMATCH: Why aren't the 144 Jira tickets matching 4,401 Salesforce cases?

-- Step 1: Show sample Salesforce case numbers (what we're looking FOR)
SELECT
  ri.source_id as salesforce_case_number,
  LENGTH(ri.source_id) as case_number_length,
  a.name as account_name
FROM friction_cards fc
JOIN raw_inputs ri ON ri.id = fc.raw_input_id
JOIN accounts a ON a.id = fc.account_id
WHERE fc.is_friction = true
  AND ri.source_id IS NOT NULL
ORDER BY RANDOM()
LIMIT 10;

-- Step 2: Show what's IN the Jira custom fields (what we're searching IN)
SELECT
  jira_key,
  summary,
  jsonb_pretty(metadata->'custom_fields') as custom_fields_sample
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
  AND metadata->'custom_fields' != '{}'
LIMIT 5;

-- Step 3: Look for ANY overlap - do any custom field VALUES contain ANY case numbers?
WITH salesforce_cases AS (
  SELECT DISTINCT ri.source_id
  FROM friction_cards fc
  JOIN raw_inputs ri ON ri.id = fc.raw_input_id
  WHERE fc.is_friction = true
    AND ri.source_id IS NOT NULL
  LIMIT 1000
),
jira_custom_values AS (
  SELECT
    jira_key,
    summary,
    jsonb_each_text(metadata->'custom_fields') as custom_field
  FROM jira_issues
  WHERE metadata->'custom_fields' IS NOT NULL
)
SELECT
  jcv.jira_key,
  jcv.summary,
  jcv.custom_field,
  sc.source_id as matching_case_number
FROM jira_custom_values jcv
CROSS JOIN salesforce_cases sc
WHERE (jcv.custom_field).value LIKE '%' || sc.source_id || '%'
LIMIT 20;

-- Step 4: Check specific custom field that SHOULD have case numbers
-- Replace 'customfield_17254' with actual field name from Step 2
SELECT
  jira_key,
  summary,
  metadata->'custom_fields'->>'customfield_17254' as case_field_value
FROM jira_issues
WHERE metadata->'custom_fields'->>'customfield_17254' IS NOT NULL
LIMIT 10;

-- Step 5: Search for 8-digit patterns in custom field VALUES
SELECT
  jira_key,
  summary,
  key as field_name,
  value as field_value
FROM jira_issues,
  jsonb_each_text(metadata->'custom_fields')
WHERE value ~ '\d{8}'  -- 8-digit pattern
LIMIT 20;
