# Jira Sync Cron Job - Migration to Supabase

## What Changed

The daily Jira sync cron job has been **migrated from Vercel Cron to Supabase pg_cron**.

### Why?

1. **Cost**: Supabase pg_cron is free (included in free tier), while Vercel Cron has limitations
2. **Centralization**: Keep all database operations in one place
3. **Reliability**: PostgreSQL's pg_cron is battle-tested and widely used
4. **Simplicity**: No need to manage authentication between services

### Before (Vercel Cron)

```
Vercel Cron Scheduler
  ↓ (HTTP GET with CRON_SECRET)
/api/cron/sync-jira
  ↓ (HTTP POST for each user)
/api/jira/sync
```

### After (Supabase pg_cron)

```
Supabase pg_cron
  ↓ (calls database function)
trigger_jira_sync()
  ↓ (HTTP POST for each user)
/api/jira/sync
```

## Files Changed

### Modified Files

1. **`app/api/jira/sync/route.ts`**
   - Now accepts both user session auth AND cron job auth
   - Cron requests use `Authorization: Bearer CRON_SECRET` + `x-user-id` header
   - Uses admin client for all database operations

2. **`vercel.json`**
   - Removed Jira sync cron job (kept portfolio analysis cron)
   ```diff
   - {
   -   "path": "/api/cron/sync-jira",
   -   "schedule": "0 3 * * *"
   - }
   ```

3. **`components/JiraSyncCard.tsx`**
   - Updated description to say "via Supabase"

4. **`app/api/cron/sync-jira/route.ts`**
   - Marked as deprecated (kept for reference)

### New Files

1. **`scripts/setup-jira-sync-cron.sql`**
   - SQL script to set up pg_cron job
   - Creates `trigger_jira_sync()` function
   - Schedules daily execution at 3 AM UTC

2. **`scripts/SUPABASE_CRON_SETUP.md`**
   - Complete setup guide
   - Troubleshooting tips
   - Monitoring queries

3. **`JIRA_CRON_MIGRATION.md`** (this file)
   - Migration summary and next steps

## What You Need to Do

### Step 1: Update the SQL Script

Open `scripts/setup-jira-sync-cron.sql` and replace these placeholders:

```sql
base_url TEXT := 'https://your-vercel-domain.vercel.app'; -- Line 18
cron_secret TEXT := 'your-cron-secret'; -- Line 19
```

**Get your values:**

1. **Vercel URL**: Vercel Dashboard → Your Project → Settings → Domains
   - Use your production domain (e.g., `friction-intelligence.vercel.app`)

2. **CRON_SECRET**: Vercel Dashboard → Your Project → Settings → Environment Variables
   - Find the `CRON_SECRET` value
   - If it doesn't exist, generate one: `openssl rand -hex 32`
   - Add it to Vercel environment variables

### Step 2: Run the SQL Script

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Copy/paste the contents of `scripts/setup-jira-sync-cron.sql`
5. Click **Run** (or press Cmd/Ctrl + Enter)

You should see output confirming the cron job was created:

```
jobid | jobname           | schedule   | command
------|-------------------|------------|----------------------------------
1     | daily-jira-sync   | 0 3 * * *  | SELECT trigger_jira_sync();
```

### Step 3: Test It

Run this in Supabase SQL Editor to trigger a manual sync:

```sql
SELECT trigger_jira_sync();
```

Check the results:

```sql
-- View cron job history
SELECT
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-jira-sync')
ORDER BY start_time DESC
LIMIT 5;
```

### Step 4: Deploy Changes

Commit and push the changes:

```bash
git add .
git commit -m "Migrate Jira sync from Vercel Cron to Supabase pg_cron"
git push
```

Vercel will automatically deploy the updated code.

### Step 5: Verify

1. Wait for deployment to finish
2. Check your dashboard - the Jira Sync card should show "via Supabase"
3. Check Supabase logs at 3 AM UTC tomorrow
4. Verify issues are syncing correctly

## Monitoring

### Check if cron is running

```sql
-- View scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'daily-jira-sync';

-- View recent executions
SELECT
  start_time,
  end_time,
  status,
  return_message,
  EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-jira-sync')
ORDER BY start_time DESC
LIMIT 10;
```

### Check HTTP requests

```sql
-- View pg_net HTTP request logs
SELECT
  created,
  status_code,
  content::text as response,
  error_msg
FROM net._http_response
WHERE url LIKE '%/api/jira/sync%'
ORDER BY created DESC
LIMIT 5;
```

## Rollback Plan

If you need to roll back to Vercel Cron:

### 1. Disable Supabase cron

```sql
SELECT cron.unschedule('daily-jira-sync');
```

### 2. Re-enable Vercel cron

Edit `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/analyze-portfolio",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/sync-jira",
      "schedule": "0 3 * * *"
    }
  ]
}
```

### 3. Revert code changes

```bash
git revert HEAD
git push
```

## Troubleshooting

See `scripts/SUPABASE_CRON_SETUP.md` for detailed troubleshooting steps.

### Common Issues

1. **401 Unauthorized**: CRON_SECRET mismatch - update SQL script with correct value
2. **404 Not Found**: Wrong Vercel URL - verify domain in Vercel settings
3. **No integrations found**: Normal if no users have connected Jira yet
4. **Cron not running**: Verify pg_cron extension is enabled

## Benefits of This Migration

✅ **Free**: No cost for cron job execution
✅ **Reliable**: PostgreSQL's pg_cron is production-grade
✅ **Simple**: No cross-service authentication needed
✅ **Centralized**: All database operations in one place
✅ **Flexible**: Easy to modify schedule or add more jobs
✅ **Transparent**: Full execution logs in database

## Next Steps

1. ✅ Review the changes (you're reading this!)
2. ⏳ Update SQL script with your values
3. ⏳ Run SQL script in Supabase
4. ⏳ Test manual sync
5. ⏳ Deploy to Vercel
6. ⏳ Monitor for 24-48 hours

Need help? See `scripts/SUPABASE_CRON_SETUP.md` for detailed setup instructions.
