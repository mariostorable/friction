-- Analyze Salesforce data coverage to understand why only 785 cases out of thousands exist

-- 1. Check raw_inputs to see total Salesforce data
SELECT
  source_type,
  COUNT(*) as total_records,
  COUNT(DISTINCT source_id) as unique_source_ids,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record
FROM raw_inputs
WHERE source_type LIKE '%salesforce%'
GROUP BY source_type;

-- 2. Check distribution by account
SELECT
  a.name as account_name,
  COUNT(DISTINCT ri.source_id) as unique_case_ids,
  COUNT(*) as total_friction_cards
FROM friction_cards fc
JOIN raw_inputs ri ON ri.id = fc.raw_input_id
JOIN accounts a ON a.id = fc.account_id
WHERE ri.source_type = 'salesforce'
  AND fc.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
GROUP BY a.id, a.name
ORDER BY unique_case_ids DESC
LIMIT 20;

-- 3. Check case number ranges to see if there's a pattern
SELECT
  SUBSTRING(ri.source_id, 1, 2) as case_prefix,
  COUNT(*) as count,
  MIN(ri.source_id) as min_case,
  MAX(ri.source_id) as max_case
FROM raw_inputs ri
JOIN friction_cards fc ON fc.raw_input_id = ri.id
WHERE ri.source_type = 'salesforce'
  AND fc.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
GROUP BY case_prefix
ORDER BY case_prefix;

-- 4. Sample some case IDs that Jira references but we don't have
-- These are the missing case IDs from the unmatched analysis
WITH missing_cases AS (
  SELECT unnest(ARRAY['02707690', '03755455', '03677829', '03713232', '03754784', '03404706']) as case_id
)
SELECT
  mc.case_id,
  CASE WHEN fc.id IS NOT NULL THEN 'In DB' ELSE 'Missing' END as status
FROM missing_cases mc
LEFT JOIN raw_inputs ri ON ri.source_id = mc.case_id AND ri.source_type = 'salesforce'
LEFT JOIN friction_cards fc ON fc.raw_input_id = ri.id AND fc.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9';

-- 5. Check if there are recent cases vs old cases
SELECT
  DATE_TRUNC('month', fc.created_at) as month,
  COUNT(DISTINCT ri.source_id) as unique_cases
FROM friction_cards fc
JOIN raw_inputs ri ON ri.id = fc.raw_input_id
WHERE ri.source_type = 'salesforce'
  AND fc.user_id = 'ab953672-7bad-4601-9289-5d766e73fec9'
GROUP BY month
ORDER BY month DESC
LIMIT 12;
