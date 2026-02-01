-- Setup Supabase pg_cron for daily Jira sync
-- This replaces the Vercel cron job with a database-scheduled task

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to trigger Jira sync via HTTP request
CREATE OR REPLACE FUNCTION trigger_jira_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  integration_record RECORD;
  base_url TEXT := 'https://your-vercel-domain.vercel.app'; -- UPDATE THIS
  cron_secret TEXT := 'your-cron-secret'; -- UPDATE THIS
  request_id BIGINT;
BEGIN
  -- Loop through all active Jira integrations
  FOR integration_record IN
    SELECT id, user_id, instance_url, metadata
    FROM integrations
    WHERE integration_type = 'jira'
      AND status = 'active'
  LOOP
    BEGIN
      -- Make async HTTP POST request using pg_net
      SELECT INTO request_id net.http_post(
        url := base_url || '/api/jira/sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-user-id', integration_record.user_id::text,
          'authorization', 'Bearer ' || cron_secret
        ),
        body := '{}'::jsonb
      );

      RAISE NOTICE 'Triggered Jira sync for user % (request_id: %)', integration_record.user_id, request_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to trigger sync for user %: %', integration_record.user_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Jira sync cron job completed - % integration(s) triggered',
    (SELECT COUNT(*) FROM integrations WHERE integration_type = 'jira' AND status = 'active');
END;
$$;

-- Schedule the function to run daily at 3:00 AM UTC
-- Remove existing job if it exists (ignore error if it doesn't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('daily-jira-sync');
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'No existing cron job to unschedule';
END $$;

-- Create new schedule
SELECT cron.schedule(
  'daily-jira-sync',           -- job name
  '0 3 * * *',                  -- cron schedule (3 AM UTC daily)
  'SELECT trigger_jira_sync();' -- SQL to execute
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'daily-jira-sync';

-- View cron job history (useful for debugging)
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-jira-sync') ORDER BY start_time DESC LIMIT 10;

-- To manually trigger the sync for testing:
-- SELECT trigger_jira_sync();
