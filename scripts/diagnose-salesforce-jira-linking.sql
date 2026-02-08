-- COMPREHENSIVE DIAGNOSTIC: Why aren't Salesforce cases linking directly to Jira tickets?
-- Run each section separately in Supabase SQL Editor

-- ========================================
-- SECTION 1: Check if Salesforce case numbers exist in friction_cards
-- ========================================
SELECT
  COUNT(*) as total_friction_cards,
  COUNT(*) FILTER (WHERE raw_inputs.source_id IS NOT NULL) as cards_with_case_number,
  COUNT(*) FILTER (WHERE raw_inputs.source_id IS NULL) as cards_without_case_number
FROM friction_cards
LEFT JOIN raw_inputs ON raw_inputs.id = friction_cards.raw_input_id
WHERE friction_cards.is_friction = true;

-- ========================================
-- SECTION 2: Sample Salesforce case numbers from friction_cards
-- ========================================
SELECT
  ri.source_id as salesforce_case_number,
  fc.theme_key,
  a.name as account_name,
  fc.created_at
FROM friction_cards fc
JOIN raw_inputs ri ON ri.id = fc.raw_input_id
JOIN accounts a ON a.id = fc.account_id
WHERE fc.is_friction = true
  AND ri.source_id IS NOT NULL
  AND ri.source_type = 'salesforce_case'
ORDER BY fc.created_at DESC
LIMIT 20;

-- ========================================
-- SECTION 3: Check if Jira metadata has custom_fields populated
-- ========================================
SELECT
  COUNT(*) as total_jira_issues,
  COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata != '{}') as issues_with_metadata,
  COUNT(*) FILTER (WHERE metadata->'custom_fields' IS NOT NULL AND metadata->'custom_fields' != '{}') as issues_with_custom_fields
FROM jira_issues;

-- ========================================
-- SECTION 4: Sample Jira custom fields to see what's actually there
-- ========================================
SELECT
  jira_key,
  summary,
  jsonb_pretty(metadata->'custom_fields') as custom_fields_formatted
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
  AND metadata->'custom_fields' != '{}'
LIMIT 3;

-- ========================================
-- SECTION 5: Search for 8-digit numbers in Jira metadata
-- ========================================
SELECT
  jira_key,
  summary,
  metadata->'custom_fields' as custom_fields
FROM jira_issues
WHERE metadata::text ~ '\d{8}'  -- Look for 8-digit patterns
LIMIT 10;

-- ========================================
-- SECTION 6: Check if description field has case numbers
-- ========================================
SELECT
  jira_key,
  summary,
  substring(description from 1 for 200) as description_sample
FROM jira_issues
WHERE description IS NOT NULL
  AND (
    description ~* 'case[: #]*\d{8}'  -- Case insensitive
    OR description ~* 'sf[- ]*\d{8}'
    OR description ~* 'salesforce.*\d{8}'
  )
LIMIT 10;

-- ========================================
-- SECTION 7: Verify no salesforce_case links exist
-- ========================================
SELECT
  match_type,
  COUNT(*) as link_count
FROM account_jira_links
GROUP BY match_type
ORDER BY link_count DESC;

-- ========================================
-- SECTION 8: Cross-check - Do any Jira metadata values match Salesforce case numbers?
-- ========================================
WITH salesforce_cases AS (
  SELECT DISTINCT ri.source_id
  FROM friction_cards fc
  JOIN raw_inputs ri ON ri.id = fc.raw_input_id
  WHERE fc.is_friction = true
    AND ri.source_id IS NOT NULL
  LIMIT 100
)
SELECT
  ji.jira_key,
  ji.summary,
  ji.metadata->'custom_fields' as custom_fields,
  sc.source_id as matching_case_number
FROM jira_issues ji
CROSS JOIN salesforce_cases sc
WHERE ji.metadata::text LIKE '%' || sc.source_id || '%'
LIMIT 10;

-- ========================================
-- SECTION 9: List all custom field keys that exist in Jira
-- ========================================
SELECT DISTINCT
  jsonb_object_keys(metadata->'custom_fields') as custom_field_name
FROM jira_issues
WHERE metadata->'custom_fields' IS NOT NULL
  AND metadata->'custom_fields' != '{}'
ORDER BY custom_field_name;
