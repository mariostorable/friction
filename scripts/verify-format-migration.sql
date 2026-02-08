-- Verify the format migration worked
-- Run this in Supabase SQL Editor

-- 1. Check source_type distribution (should be all 'salesforce' now)
SELECT
  source_type,
  COUNT(*) as count
FROM raw_inputs
GROUP BY source_type
ORDER BY count DESC;

-- 2. Check case number format (should be 8-digit now, not 500xxx)
SELECT
  source_id,
  LENGTH(source_id) as id_length,
  LEFT(text_content, 80) as preview
FROM raw_inputs
WHERE source_type = 'salesforce'
  AND source_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- 3. Verify New Crescendo cases are now in correct format
SELECT
  source_type,
  source_id,
  metadata->>'case_number' as case_number_in_metadata,
  LEFT(text_content, 80) as preview
FROM raw_inputs
WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE '%Crescendo%')
  AND source_type = 'salesforce'
ORDER BY created_at DESC
LIMIT 5;

-- 4. Count how many friction cards now have case numbers
SELECT
  COUNT(DISTINCT fc.id) as friction_cards_with_case_numbers
FROM friction_cards fc
INNER JOIN raw_inputs ri ON ri.id = fc.raw_input_id
WHERE ri.source_type = 'salesforce'
  AND ri.source_id IS NOT NULL
  AND ri.source_id ~ '^\d{8}$'  -- Regex: exactly 8 digits
  AND fc.is_friction = true;
