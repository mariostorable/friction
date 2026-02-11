-- Check what columns exist in account_snapshots table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'account_snapshots'
ORDER BY ordinal_position;
