-- Check the structure of account_jira_links table
-- Run this in Supabase SQL Editor

-- 1. Show table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'account_jira_links'
ORDER BY ordinal_position;

-- 2. Check if table exists at all
SELECT EXISTS (
   SELECT FROM information_schema.tables
   WHERE table_name = 'account_jira_links'
) as table_exists;

-- 3. Check indexes and constraints
SELECT
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'account_jira_links'::regclass;
