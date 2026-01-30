-- Debug script to check what Origin data we have for recent R6 Group cases
-- Run this in Supabase SQL Editor

-- Check raw_inputs metadata for this account
SELECT
  source_id,
  metadata->>'case_number' as case_number,
  metadata->>'subject' as subject,
  metadata->>'origin' as origin,
  metadata->>'status' as status,
  created_at
FROM raw_inputs
WHERE account_id = 'c06995bc-f291-4111-9ae5-64a9b06c10a7'  -- R6 Group Pty Ltd - CORP
ORDER BY created_at DESC
LIMIT 10;

-- This will show us what the Salesforce API actually returned for the Origin field
