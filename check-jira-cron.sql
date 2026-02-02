-- ================================================================
-- Check Jira Sync Cron Job Status
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. Check if the daily-jira-sync job exists
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active,
  database,
  username
FROM cron.job
WHERE jobname = 'daily-jira-sync';

-- 2. Check recent execution history (last 10 runs)
SELECT
  start_time AT TIME ZONE 'UTC' as start_time_utc,
  end_time AT TIME ZONE 'UTC' as end_time_utc,
  status,
  return_message,
  EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-jira-sync')
ORDER BY start_time DESC
LIMIT 10;

-- 3. Check if trigger_jira_sync function exists
SELECT
  proname as function_name,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'trigger_jira_sync';

-- 4. Check active Jira integrations
SELECT
  id,
  user_id,
  instance_url,
  status,
  last_synced_at
FROM integrations
WHERE integration_type = 'jira'
AND status = 'active';

-- 5. Test trigger manually (OPTIONAL - uncomment to run)
-- SELECT trigger_jira_sync();
