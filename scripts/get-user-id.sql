-- Get the user ID for the backfill script
-- Run this in Supabase SQL Editor to get your user ID

SELECT id, email
FROM auth.users
LIMIT 1;
