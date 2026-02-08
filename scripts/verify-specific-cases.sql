-- Verify the specific case numbers from CRM-34 now exist
-- Run this in Supabase SQL Editor

-- Check if cases 03717747 and 03718049 exist in raw_inputs
SELECT
  source_id,
  source_type,
  account_id,
  LEFT(text_content, 100) as text_preview,
  created_at
FROM raw_inputs
WHERE source_id IN ('03717747', '03718049')
  AND source_type = 'salesforce';

-- Check if they're linked to friction cards
SELECT
  fc.id as friction_card_id,
  fc.theme_key,
  fc.account_id,
  ri.source_id as case_number,
  LEFT(fc.summary, 80) as friction_summary,
  accounts.name as account_name
FROM friction_cards fc
INNER JOIN raw_inputs ri ON ri.id = fc.raw_input_id
INNER JOIN accounts ON accounts.id = fc.account_id
WHERE ri.source_id IN ('03717747', '03718049')
  AND fc.is_friction = true;
