# Sync & Analyze Flow Explained

## What happens when you click "Sync & Analyze All"

### Step 1: Salesforce Sync (`/api/salesforce/sync`)
**Duration:** ~2-5 seconds

**What it does:**
1. Fetches up to 200 accounts from Salesforce (sorted by ARR)
2. Updates account metadata in database:
   - Name, ARR, products, owner, facility count, etc.
3. Rebuilds portfolios:
   - Top 25 Storage (EDGE + SiteLink)
   - Top 25 Marine
4. **Triggers analysis in background** (fire-and-forget call to `/api/cron/analyze-portfolio`)

**Code:** `app/api/salesforce/sync/route.ts` lines 288-305

```typescript
// Fire and forget - don't wait for completion
fetch(analyzeUrl, {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
}).catch(e => console.error('Error triggering analysis:', e));
```

---

### Step 2: Friction Analysis (`/api/cron/analyze-portfolio`)
**Duration:** 10-15 minutes for 33 accounts

**What it does:**
1. Gets all accounts in portfolios that need analysis
2. For each account (up to **50 per run**):
   - Checks if already analyzed today → skip if yes
   - Fetches up to **2000 cases from Salesforce** (last 90 days)
   - Sends each case to Claude API for friction analysis
   - Creates friction cards
   - Calculates OFI score
   - Creates snapshot with today's date
   - Generates alerts if needed
3. Stops after 50 accounts or 5-minute timeout (Vercel limit)

**Code:** `app/api/cron/analyze-portfolio/route.ts`

---

## The Problem (Pre-Fix)

### Issue 1: Low Limit
- **Old limit:** 10 accounts per run (line 79)
- **Your accounts:** 33 need analysis
- **Result:** Would take 4 hours if cron was working

### Issue 2: Hidden Failures
- Analysis runs in background (fire-and-forget)
- If it fails, you don't see errors
- UI polls database for progress, but analysis might not have started

### Issue 3: Misleading UI
- UI said "analyzing up to 3 accounts"
- Actually processes 10 (now 50)
- UI said "runs at 2am UTC"
- Actually runs every hour

---

## The Fix

1. ✅ **Increased limit:** 10 → 50 accounts per run
2. ✅ **Updated UI text:** Shows correct "up to 50 accounts"
3. ✅ **Fixed schedule text:** "every hour" not "2am UTC"
4. ✅ **Created diagnostic script:** `scripts/check-and-fix-cron.sql`

---

## Why It's Still Showing 33 Red

**Most likely cause:** The Supabase cron job is not running

The hourly cron should have cleared all 33 accounts by now. Since last analysis was 1/29 (2 days ago), the cron is definitely not running.

---

## How to Fix Right Now

### Option 1: Check Supabase Cron (Recommended)
1. Open Supabase SQL Editor
2. Run the diagnostic script: `scripts/check-and-fix-cron.sql`
3. If no job exists or it's inactive, uncomment FIX 1 or FIX 2
4. Uncomment FIX 4 to manually trigger right now

### Option 2: Manual Trigger from UI
1. Click "Sync & Analyze All" button
2. Wait 10-15 minutes (process all 33 accounts)
3. Refresh page

### Option 3: Direct API Call
Open your browser console and run:
```javascript
fetch('https://friction-intelligence.vercel.app/api/cron/analyze-portfolio', {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' }
})
```

Then wait 10-15 minutes and refresh.

---

## Monitoring Progress

### In Supabase
```sql
-- Check recent snapshots
SELECT
  a.name,
  s.snapshot_date,
  s.ofi_score,
  s.created_at
FROM accounts a
JOIN account_snapshots s ON s.account_id = a.id
WHERE s.snapshot_date = CURRENT_DATE
ORDER BY s.created_at DESC;
```

### In Vercel Logs
1. Go to Vercel dashboard → Project → Deployments
2. Click on your deployment → Functions
3. Look for `/api/cron/analyze-portfolio` logs

---

## Expected Logs When Working

```
=== Analyze Portfolio Endpoint Called ===
Auth header present: true
CRON_SECRET configured: true
✓ Expired alerts cleaned up
Found 33 accounts in portfolios
Fetching cases for account: Prime Group Holdings, LLC
Found 42 cases for Prime Group Holdings, LLC
Cleaning up old data for Prime Group Holdings, LLC...
Analyzing 42 cases for Prime Group Holdings, LLC...
Progress: 20/42 cases analyzed
Progress: 40/42 cases analyzed
OFI Calculation: { frictionCards: 15, totalCases: 42, ofiScore: 45 }
✓ Snapshot created successfully for Prime Group Holdings, LLC
✓ Created 2 alert(s)
...
=== Analysis Complete ===
Total accounts processed: 33
Success: 33, Skipped: 0, Failed: 0
```

---

## Common Issues

### 1. "Checking 3/3" then nothing happens
This means:
- Salesforce sync completed (got 3 accounts or updated 3)
- Analysis was triggered in background
- But analysis might have failed silently

**Fix:** Check Vercel logs for errors

### 2. Progress shows 0/0 cases
This means:
- No recent raw_inputs created in last 10 minutes
- Either analysis hasn't started, or it's checking snapshots (fast)

**Fix:** Wait 2-3 minutes, refresh page

### 3. Some accounts still red after manual sync
This means:
- Analysis started but hit the 50-account limit
- Or hit 5-minute timeout

**Fix:** Click sync again to process remaining accounts

---

## Testing the Fix

After deploying the changes:

1. **Clear one account's snapshot to test:**
```sql
DELETE FROM account_snapshots
WHERE account_id = (
  SELECT id FROM accounts WHERE name = 'Prime Group Holdings, LLC' LIMIT 1
);
```

2. **Manually trigger analysis:**
```sql
SELECT net.http_post(
  url:='https://friction-intelligence.vercel.app/api/cron/analyze-portfolio',
  headers:='{"Content-Type": "application/json"}'::jsonb
) as request_id;
```

3. **Check Vercel logs** - should see:
   - "Fetching cases for account: Prime Group Holdings, LLC"
   - "Found X cases"
   - "✓ Snapshot created successfully"

4. **Verify in database:**
```sql
SELECT * FROM account_snapshots
WHERE snapshot_date = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 10;
```

Should see Prime Group Holdings with today's date.
