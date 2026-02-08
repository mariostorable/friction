-- Verify account_jira_links were actually created
-- Run this in Supabase SQL Editor

-- 1. First check what columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'account_jira_links'
ORDER BY ordinal_position;

-- 2. Count total account links (using correct columns)
SELECT COUNT(*) as total_links,
       COUNT(DISTINCT account_id) as unique_accounts
FROM account_jira_links;

-- 3. Sample 10 account links to see what was created
SELECT *
FROM account_jira_links
LIMIT 10;
