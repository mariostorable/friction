-- Check if Salesforce case numbers from Jira exist in friction cards
-- Run this in Supabase SQL Editor

-- 1. Check if the specific case numbers from CRM-34 exist in raw_inputs
SELECT
  source_id,
  LEFT(text_content, 100) as text_preview,
  created_at
FROM raw_inputs
WHERE source_id IN ('03717747', '03718049')
  AND source_type = 'salesforce';

-- 2. Check what format case numbers are stored in raw_inputs
SELECT
  source_id,
  LENGTH(source_id) as id_length,
  LEFT(text_content, 100) as text_preview
FROM raw_inputs
WHERE source_type = 'salesforce'
  AND source_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check if those cases are linked to friction cards
SELECT
  fc.id as friction_card_id,
  fc.theme_key,
  fc.account_id,
  ri.source_id as case_number,
  LEFT(ri.text_content, 100) as text_preview
FROM friction_cards fc
INNER JOIN raw_inputs ri ON ri.id = fc.raw_input_id
WHERE ri.source_id IN ('03717747', '03718049')
  AND fc.is_friction = true;

-- 4. Count how many friction cards have Salesforce case numbers
SELECT
  COUNT(DISTINCT fc.id) as friction_cards_with_cases,
  COUNT(DISTINCT ri.source_id) as unique_case_numbers,
  COUNT(DISTINCT fc.account_id) as unique_accounts
FROM friction_cards fc
INNER JOIN raw_inputs ri ON ri.id = fc.raw_input_id
WHERE ri.source_type = 'salesforce'
  AND ri.source_id IS NOT NULL
  AND fc.is_friction = true;
