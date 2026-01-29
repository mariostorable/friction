-- ================================================================
-- Manually trigger the analysis endpoint RIGHT NOW
-- Run this in Supabase SQL Editor to start analyzing accounts immediately
-- ================================================================

-- Trigger the analysis endpoint manually
SELECT net.http_get(
  url := 'https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
  headers := jsonb_build_object('Content-Type', 'application/json')
) as request_id;

-- Wait a few seconds, then check the result
-- You can run this query to see the response:
SELECT
  id,
  status_code,
  content::text as response,
  created
FROM net.http_request_queue
ORDER BY created DESC
LIMIT 5;
