-- Check if trigger_jira_sync function exists and see its definition
SELECT
  proname as function_name,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'trigger_jira_sync';
