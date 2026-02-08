-- Debug why New Crescendo returned 0 cases
-- Run this in Supabase SQL Editor

-- 1. Get account details
SELECT
  id,
  name,
  salesforce_id,
  created_at
FROM accounts
WHERE name LIKE '%Crescendo%';

-- 2. Check if any raw_inputs exist for this account
SELECT
  COUNT(*) as total_raw_inputs,
  COUNT(*) FILTER (WHERE source_type = 'salesforce') as salesforce_inputs,
  MAX(created_at) as most_recent_sync,
  MAX(metadata->>'created_date') as most_recent_case_date
FROM raw_inputs
WHERE account_id IN (
  SELECT id FROM accounts WHERE name LIKE '%Crescendo%'
);

-- 3. Sample raw_inputs to see what's there
SELECT
  id,
  source_type,
  source_id,
  LEFT(text_content, 80) as preview,
  metadata->>'created_date' as sf_created_date,
  created_at as db_created_at
FROM raw_inputs
WHERE account_id IN (
  SELECT id FROM accounts WHERE name LIKE '%Crescendo%'
)
ORDER BY created_at DESC
LIMIT 10;
