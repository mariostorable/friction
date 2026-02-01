# Supabase Cron Job Setup Guide

This guide explains how to set up the daily Jira sync cron job in Supabase using pg_cron.

## Overview

The Jira sync job runs daily at 3:00 AM UTC and automatically syncs all active Jira integrations by calling your Next.js API endpoint.

**Architecture:**
- **Database**: Supabase PostgreSQL with pg_cron extension
- **Function**: `trigger_jira_sync()` - Makes HTTP requests to your API
- **Schedule**: Daily at 3:00 AM UTC (via pg_cron)
- **Authentication**: Uses CRON_SECRET environment variable

## Prerequisites

1. Supabase project with PostgreSQL database
2. Next.js app deployed to Vercel
3. `CRON_SECRET` environment variable set in Vercel

## Setup Steps

### Step 1: Configure Environment Variables

#### 1.1 Update the SQL Script

Open `scripts/setup-jira-sync-cron.sql` and update these values:

```sql
base_url TEXT := 'https://your-vercel-domain.vercel.app'; -- UPDATE THIS
cron_secret TEXT := 'your-cron-secret'; -- UPDATE THIS
```

Replace:
- `your-vercel-domain.vercel.app` with your actual Vercel deployment URL
- `your-cron-secret` with the value of your `CRON_SECRET` env var

**Finding your Vercel URL:**
- Go to Vercel Dashboard → Your Project → Settings → Domains
- Copy your production domain (e.g., `friction-intelligence.vercel.app`)

**Getting your CRON_SECRET:**
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Find `CRON_SECRET` value (or create one if it doesn't exist)

### Step 2: Run the SQL Script

#### 2.1 Open Supabase SQL Editor

1. Go to your Supabase project
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**

#### 2.2 Execute the Script

1. Copy the entire contents of `scripts/setup-jira-sync-cron.sql`
2. Paste into the SQL Editor
3. Click **Run** or press `Cmd/Ctrl + Enter`

#### 2.3 Verify Installation

The script will output the cron job details. You should see:

```
jobid | jobname           | schedule   | command
------|-------------------|------------|----------------------------------
1     | daily-jira-sync   | 0 3 * * *  | SELECT trigger_jira_sync();
```

### Step 3: Test the Cron Job

#### 3.1 Manual Test

Run this SQL command to trigger the sync immediately:

```sql
SELECT trigger_jira_sync();
```

#### 3.2 Check Results

View the cron job execution history:

```sql
SELECT
  jobid,
  runid,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-jira-sync')
ORDER BY start_time DESC
LIMIT 10;
```

#### 3.3 Verify API Calls

Check your Vercel deployment logs:
1. Go to Vercel Dashboard → Your Project → Deployments
2. Click on your production deployment
3. Click **Functions** tab
4. Look for logs from `/api/jira/sync`

You should see log entries like:
```
Fetching Jira issues with JQL: updated >= -90d ORDER BY updated DESC
Fetched X issues so far...
Sync complete: X issues, Y theme links created
```

### Step 4: Monitor the Cron Job

#### 4.1 View Upcoming Runs

```sql
SELECT * FROM cron.job WHERE jobname = 'daily-jira-sync';
```

#### 4.2 View Recent Execution History

```sql
SELECT
  start_time,
  end_time,
  status,
  return_message,
  EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-jira-sync')
ORDER BY start_time DESC
LIMIT 5;
```

#### 4.3 Check HTTP Request Logs

Supabase's pg_net extension logs all HTTP requests:

```sql
SELECT
  id,
  created,
  status_code,
  content::text as response,
  error_msg
FROM net._http_response
WHERE url LIKE '%/api/jira/sync%'
ORDER BY created DESC
LIMIT 5;
```

## Troubleshooting

### Issue: "Missing required configuration"

**Error:**
```
ERROR: Missing required configuration: app.base_url or app.cron_secret
```

**Solution:**
You forgot to update the SQL script with your actual values. Edit `scripts/setup-jira-sync-cron.sql` and replace the placeholder values:

```sql
base_url TEXT := 'https://YOUR-ACTUAL-DOMAIN.vercel.app';
cron_secret TEXT := 'YOUR-ACTUAL-CRON-SECRET';
```

Then re-run the script.

### Issue: HTTP 401 Unauthorized

**Error in logs:**
```
Failed to sync for user X: Unauthorized
```

**Solution:**
The CRON_SECRET in your SQL script doesn't match the one in Vercel.

1. Check Vercel env var: Vercel Dashboard → Settings → Environment Variables → `CRON_SECRET`
2. Update the SQL script with the correct value
3. Re-run the script to update the function

### Issue: HTTP 404 Not Found

**Error:**
```
status_code: 404
```

**Solution:**
Your base URL is incorrect or the API route doesn't exist.

1. Verify your Vercel URL is correct (check Vercel Dashboard → Domains)
2. Make sure `/api/jira/sync/route.ts` is deployed
3. Test manually: `curl -X POST https://your-domain.vercel.app/api/jira/sync -H "Authorization: Bearer your-secret" -H "x-user-id: user-uuid"`

### Issue: No integrations found

**Message:**
```
Jira sync cron job completed - 0 integration(s) triggered
```

**Cause:**
No active Jira integrations in the database.

**Solution:**
This is normal if no users have connected Jira yet. Once users connect Jira in the Settings page, the cron will sync their issues.

### Issue: Cron not running at scheduled time

**Symptoms:**
- No entries in `cron.job_run_details` after 3 AM UTC
- Job shows in `cron.job` but never executes

**Solution:**
1. Verify pg_cron extension is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Check if cron job is active:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'daily-jira-sync';
   ```

3. If the job exists but isn't running, recreate it:
   ```sql
   SELECT cron.unschedule('daily-jira-sync');
   SELECT cron.schedule(
     'daily-jira-sync',
     '0 3 * * *',
     'SELECT trigger_jira_sync();'
   );
   ```

## Modifying the Schedule

To change the sync time, update the cron schedule:

```sql
-- Unschedule existing job
SELECT cron.unschedule('daily-jira-sync');

-- Create new schedule (example: 6 AM UTC)
SELECT cron.schedule(
  'daily-jira-sync',
  '0 6 * * *',  -- Change this line
  'SELECT trigger_jira_sync();'
);
```

**Cron schedule format:** `minute hour day month weekday`

Examples:
- `0 3 * * *` - 3:00 AM UTC daily
- `0 6 * * *` - 6:00 AM UTC daily
- `0 0 * * 1` - Midnight UTC every Monday
- `0 */6 * * *` - Every 6 hours

## Disabling the Cron Job

To temporarily disable without deleting:

```sql
SELECT cron.unschedule('daily-jira-sync');
```

To re-enable, run the schedule command again from the setup script.

## Security Notes

1. **CRON_SECRET**: Never commit this value to git. Store in environment variables only.
2. **API Authentication**: The sync endpoint requires either:
   - A valid user session (for manual syncs), OR
   - `Authorization: Bearer CRON_SECRET` + `x-user-id` header (for cron)
3. **Database Security**: The `trigger_jira_sync()` function uses `SECURITY DEFINER` to access all integrations regardless of RLS policies
4. **HTTPS Only**: Always use HTTPS URLs in production

## Cost Considerations

- **Supabase Free Tier**: Includes pg_cron at no extra cost
- **pg_net HTTP requests**: Free for reasonable usage (thousands of requests/month)
- **Database compute**: Minimal impact (< 1 second per execution)

**Compared to alternatives:**
- Vercel Cron: Free (limited to 1/hour on Hobby plan)
- AWS EventBridge: ~$1/million events
- Google Cloud Scheduler: $0.10/job/month

Supabase pg_cron is the most cost-effective option for this use case.

## Next Steps

1. ✅ Set up the cron job (you just did this!)
2. ✅ Test manual execution
3. ✅ Wait for first scheduled run (3 AM UTC)
4. ✅ Check dashboard for sync stats
5. ✅ Monitor for 24-48 hours to ensure reliability

Your Jira sync is now fully automated! 🎉
