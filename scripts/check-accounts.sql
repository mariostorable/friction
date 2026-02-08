-- Check if accounts exist and how they're structured
-- Run this in Supabase SQL Editor

-- 1. Check what columns exist in accounts table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accounts'
ORDER BY ordinal_position;

-- 2. Count total accounts
SELECT COUNT(*) as total_accounts
FROM accounts;

-- 3. Sample 5 accounts (showing all columns)
SELECT *
FROM accounts
ORDER BY created_at DESC
LIMIT 5;
