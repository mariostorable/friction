-- Update the trigger_jira_sync function with your actual credentials
-- Run this after you've created the initial function

CREATE OR REPLACE FUNCTION trigger_jira_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  integration_record RECORD;
  base_url TEXT := 'https://friction-intelligence.vercel.app'; -- UPDATE with your domain
  cron_secret TEXT := 'YOUR_CRON_SECRET_HERE'; -- UPDATE with your CRON_SECRET from Vercel
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

-- Test the function manually
SELECT trigger_jira_sync();
