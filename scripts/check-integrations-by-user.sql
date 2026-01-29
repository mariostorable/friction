-- ================================================================
-- Check which integrations are connected to which user accounts
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. List all users and their emails
SELECT
  id,
  email,
  created_at
FROM auth.users
ORDER BY email;

-- 2. Check integrations for each user
SELECT
  u.email as user_email,
  i.integration_type,
  i.status,
  i.instance_url,
  i.connected_at,
  i.last_synced_at
FROM auth.users u
LEFT JOIN integrations i ON i.user_id = u.id
ORDER BY u.email, i.integration_type;

-- 3. Count accounts per user
SELECT
  u.email as user_email,
  COUNT(a.id) as account_count
FROM auth.users u
LEFT JOIN accounts a ON a.user_id = u.id
GROUP BY u.email
ORDER BY u.email;

-- 4. See if there are any Jira-related data (in case it was added)
SELECT * FROM integrations WHERE integration_type NOT IN ('salesforce', 'zendesk', 'gong', 'slack');
