-- Enable pg_cron extension (run in Supabase SQL Editor)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the analyze-portfolio endpoint to run every hour
-- This bypasses Vercel's Hobby plan daily limit
SELECT cron.schedule(
    'analyze-portfolio-hourly',  -- Job name
    '0 * * * *',                  -- Every hour at minute 0
    $$
    SELECT
      net.http_post(
          url:='https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
          headers:='{"Content-Type": "application/json"}'::jsonb
      ) as request_id;
    $$
);

-- Optional: View all scheduled cron jobs
SELECT * FROM cron.job;

-- Optional: To delete the job later
-- SELECT cron.unschedule('analyze-portfolio-hourly');
