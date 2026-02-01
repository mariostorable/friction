-- Check case sync status across all accounts
-- This query will show us which accounts have synced cases and when

-- 1. Check raw_inputs (unprocessed cases)
SELECT
  a.name as account_name,
  COUNT(*) FILTER (WHERE ri.processed = false) as unprocessed_cases,
  COUNT(*) FILTER (WHERE ri.processed = true) as processed_cases,
  COUNT(*) as total_cases,
  MAX(ri.created_at) as last_case_synced_at,
  MAX(ri.metadata->>'created_date') as last_sf_case_date
FROM accounts a
LEFT JOIN raw_inputs ri ON ri.account_id = a.id
WHERE a.status = 'active'
GROUP BY a.id, a.name
ORDER BY a.name;

-- 2. Check Salesforce integration status
SELECT
  integration_type,
  status,
  last_synced_at,
  metadata
FROM integrations
WHERE integration_type = 'salesforce'
ORDER BY last_synced_at DESC;

-- 3. Check friction_cards (processed cases)
SELECT
  a.name as account_name,
  COUNT(fc.id) as friction_cards,
  MAX(fc.created_at) as last_card_created
FROM accounts a
LEFT JOIN friction_cards fc ON fc.account_id = a.id
WHERE a.status = 'active'
GROUP BY a.id, a.name
ORDER BY a.name;
