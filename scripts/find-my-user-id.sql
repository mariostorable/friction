-- ================================================================
-- Find YOUR actual user_id - Run each query separately
-- ================================================================

-- Query 1: All users in the system with their emails
SELECT
  id as user_id,
  email,
  created_at
FROM auth.users
ORDER BY created_at;

-- Query 2: Which user has accounts?
SELECT
  user_id,
  COUNT(*) as total_accounts,
  COUNT(*) FILTER (WHERE status = 'active') as active_accounts,
  COUNT(*) FILTER (WHERE vertical = 'storage') as storage_accounts
FROM accounts
GROUP BY user_id
ORDER BY total_accounts DESC;

-- Query 3: Which user has portfolios?
SELECT
  user_id,
  portfolio_type,
  array_length(account_ids, 1) as account_count
FROM portfolios
ORDER BY user_id, portfolio_type;

-- Query 4: Which user has integrations (Salesforce, Jira)?
SELECT
  user_id,
  integration_type,
  status,
  instance_url
FROM integrations
ORDER BY user_id, integration_type;
