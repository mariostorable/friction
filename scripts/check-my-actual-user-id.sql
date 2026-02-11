-- ================================================================
-- Find YOUR actual user_id that you're logged in as
-- ================================================================

-- Option 1: Check who owns accounts
SELECT DISTINCT
  'Your user_id:' as label,
  user_id
FROM accounts
WHERE user_id IS NOT NULL
ORDER BY user_id;

-- Option 2: Check who has integrations
SELECT DISTINCT
  'User with integrations:' as label,
  user_id,
  integration_type,
  status
FROM integrations
ORDER BY user_id;

-- Option 3: Check ALL users in the system
SELECT
  'All auth users:' as label,
  id as user_id,
  email,
  created_at
FROM auth.users
ORDER BY created_at;

-- Option 4: Which user_id has the most accounts?
SELECT
  'Accounts per user:' as label,
  user_id,
  COUNT(*) as account_count,
  COUNT(*) FILTER (WHERE status = 'active') as active_count
FROM accounts
GROUP BY user_id
ORDER BY account_count DESC;
