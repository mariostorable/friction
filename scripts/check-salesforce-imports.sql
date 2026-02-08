-- Check if any Salesforce data has been imported
-- Run this in Supabase SQL Editor

-- 1. Count Salesforce raw_inputs
SELECT
  COUNT(*) as total_salesforce_inputs,
  COUNT(*) FILTER (WHERE source_id IS NOT NULL) as inputs_with_case_numbers,
  COUNT(*) FILTER (WHERE source_id IS NULL) as inputs_without_case_numbers
FROM raw_inputs
WHERE source_type = 'salesforce';

-- 2. Sample 5 Salesforce raw_inputs to see what they look like
SELECT
  id,
  account_id,
  source_id,
  LEFT(text_content, 100) as text_preview,
  created_at
FROM raw_inputs
WHERE source_type = 'salesforce'
ORDER BY created_at DESC
LIMIT 5;

-- 3. Check if any friction cards are from Salesforce (even without source_id)
SELECT
  COUNT(*) as total_friction_cards,
  COUNT(*) FILTER (WHERE ri.source_type = 'salesforce') as from_salesforce,
  COUNT(*) FILTER (WHERE ri.source_type != 'salesforce' OR ri.source_type IS NULL) as from_other_sources
FROM friction_cards fc
LEFT JOIN raw_inputs ri ON ri.id = fc.raw_input_id
WHERE fc.is_friction = true;
