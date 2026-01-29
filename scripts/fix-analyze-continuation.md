# Fix for "Analyze Again" Not Working

## Problem
When analyzing accounts with >100 cases, the first batch processes 100 cases, then shows "106 cases remaining - click Analyze again to continue". But clicking Analyze again doesn't work or shows "No unprocessed cases found".

## Root Cause
The analyze endpoint processes 100 cases at a time and marks them ALL as processed (even failed ones) to avoid infinite loops. After reload, the remaining cases should be processed, but the button might not be triggering properly.

## Quick Fix Options:

### Option 1: Check for Stuck Cases (Run this SQL)
```sql
-- See if there are actually unprocessed cases
SELECT account_id, COUNT(*) as unprocessed_count
FROM raw_inputs
WHERE processed = false
GROUP BY account_id
ORDER BY unprocessed_count DESC;

-- If you see cases stuck as unprocessed, check them:
SELECT
  id,
  metadata->>'case_number' as case_num,
  created_at,
  processed
FROM raw_inputs
WHERE account_id = 'YOUR_ACCOUNT_ID'
  AND processed = false
LIMIT 10;
```

### Option 2: Force Re-analyze All Cases
If cases got stuck, reset them:
```sql
-- Reset processed flag for specific account
UPDATE raw_inputs
SET processed = false
WHERE account_id = 'YOUR_ACCOUNT_ID'
  AND source_type = 'salesforce_case';

-- Then click Analyze button again in the UI
```

### Option 3: Use the Cron Job Instead
The cron job processes accounts automatically every 10 minutes (3 accounts per run).
Just wait and the cron will finish analyzing the remaining cases.

## Long-term Fix Needed:
Add auto-continuation logic so the analyze button automatically processes all batches without requiring manual clicks.
