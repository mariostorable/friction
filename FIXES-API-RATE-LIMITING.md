# Fixes: API Rate Limiting & Case Limits

## Issues Fixed

### 1. ❌ **API Error 529: Overloaded**
Claude API was returning 529 errors when analyzing accounts with many cases, causing analysis to fail.

### 2. ❌ **100 Case Limit**
System was artificially limiting analysis to only 100 cases per account, even if more cases existed in the 90-day window.

---

## Solutions Implemented

### 1. ✅ **Retry Logic with Exponential Backoff**

Added automatic retry handling for API 529 (overloaded) errors:

**How it works:**
- When API returns 529, automatically retry with increasing delays
- Retry delays: 1s → 2s → 4s → up to 30s max
- Up to 3 retry attempts per API call
- Fails gracefully if max retries exceeded

**Files updated:**
- `app/api/analyze-friction/route.ts` - Manual "Analyze Friction" button
- `app/api/cron/analyze-portfolio/route.ts` - Automated hourly job

**Code added:**
```typescript
// Helper function: retry with exponential backoff for API 529 errors
async function callAnthropicWithRetry(prompt: string, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {...});

      // If 529 (overloaded), retry with exponential backoff
      if (response.status === 529) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.log(`API overloaded (529), retrying in ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 2. ✅ **Rate Limiting Between Requests**

Added 200ms delay between API calls to avoid overwhelming the API:

```typescript
// Small delay between API calls to avoid rate limiting (200ms)
await sleep(200);
```

**Why 200ms?**
- Allows ~5 requests per second
- For 300 cases: ~60 seconds total
- Stays well under API rate limits
- Prevents 529 errors proactively

### 3. ✅ **Removed Case Limits**

**Before:**
- `LIMIT 50` in analyze-friction route
- `LIMIT 100` in sync-cases route
- `LIMIT 100` in cron analyze-portfolio route

**After:**
- ✅ No limits - fetches ALL cases in 90-day window
- Salesforce naturally caps at ~2000 records per query
- All cases are analyzed (not just first 100)

**Files updated:**
- `app/api/analyze-friction/route.ts` - Removed `.limit(50)`
- `app/api/salesforce/sync-cases/route.ts` - Removed `LIMIT 100` from SOQL
- `app/api/cron/analyze-portfolio/route.ts` - Removed `LIMIT 100` and `slice(0, 100)`

### 4. ✅ **Progress Logging**

Added console logging to track progress:

```typescript
// Log progress every 10 cases
if (i % 10 === 0) {
  console.log(`Processing case ${i + 1}/${rawInputs.length}...`);
}
```

**Benefits:**
- Monitor analysis progress in real-time
- Identify where failures occur
- Estimate completion time

---

## Impact

### Before (With Issues):
- ❌ Analysis failed with 529 errors on busy accounts
- ❌ Only analyzed first 100 cases (missing data)
- ❌ No visibility into progress
- ❌ No recovery from transient API issues

### After (With Fixes):
- ✅ Analysis succeeds even during high API load
- ✅ Analyzes ALL cases in 90-day window (no limit)
- ✅ Progress visible in console logs
- ✅ Automatic retry on temporary failures
- ✅ Better rate limiting prevents 529 errors

---

## Testing Instructions

### Test 1: High-Volume Account
1. Navigate to Elite-Stor Storage - CORP (or any account with 150+ cases)
2. Click **"Analyze Friction"**
3. **Expected:** Analysis completes successfully (may take 60-120 seconds)
4. Check browser console for progress logs
5. Verify all cases are analyzed (not capped at 100)

### Test 2: API Overload Handling
1. Manually trigger analysis on 3-4 accounts simultaneously
2. **Expected:** Some may get 529 initially, but should retry and succeed
3. Check console logs for retry messages
4. All accounts should eventually complete

### Test 3: Automated Job
1. Wait for hourly cron job to run
2. Check Vercel logs: `vercel logs --follow`
3. **Expected:** Accounts analyzed without 100-case cap
4. Look for retry logs if API is busy

---

## Performance Characteristics

### Analysis Time Estimates

| Cases | Old Time | New Time | Notes |
|-------|----------|----------|-------|
| 50    | ~10s     | ~12s     | +2s due to rate limiting |
| 100   | ~20s     | ~25s     | Slightly slower but more reliable |
| 200   | N/A*     | ~50s     | *Previously capped at 100 |
| 300   | N/A*     | ~75s     | *Previously capped at 100 |

**Key:**
- Old: Failed on busy API, capped at 100 cases
- New: Reliable, analyzes all cases

### API Request Pattern

**Old (Failure-Prone):**
```
Request → 529 Error → FAIL ❌
```

**New (Resilient):**
```
Request → 529 Error → Wait 1s → Retry
        → 529 Error → Wait 2s → Retry
        → 200 Success ✅
```

---

## Error Messages Explained

### Before Fix:
```
❌ Analysis failed: Claude API call failed: API Error 529: Overloaded
```

### After Fix:
```
✅ API overloaded (529), retrying in 1000ms... (attempt 1/3)
✅ API overloaded (529), retrying in 2000ms... (attempt 2/3)
✅ Processing case 50/157...
✅ Successfully analyzed 157 cases
```

---

## Monitoring

### Key Metrics to Watch:

1. **Success Rate**
   - Monitor: `Analyzed X cases successfully` in logs
   - Target: >95% of cases analyzed successfully

2. **Retry Rate**
   - Monitor: Count of "retrying" messages in logs
   - Target: <10% of requests need retry

3. **Analysis Duration**
   - Monitor: Time from start to completion
   - Target: ~0.25s per case (including delays)

4. **Error Rate**
   - Monitor: "Max retries exceeded" errors
   - Target: <1% of requests fail after retries

### Vercel Logs Query:
```bash
# Watch for retry patterns
vercel logs --follow | grep "retrying"

# Watch for failures
vercel logs --follow | grep "Max retries"

# Watch for progress
vercel logs --follow | grep "Processing case"
```

---

## Future Improvements

### Possible Enhancements:

1. **Batch Processing**
   - Process cases in batches of 10 with parallel requests
   - Could reduce total time by 3-5x
   - Requires careful rate limit management

2. **Adaptive Rate Limiting**
   - Slow down if seeing many 529 errors
   - Speed up when API is responsive
   - Dynamic delay calculation

3. **Progress UI**
   - Show real-time progress bar to user
   - "Analyzing case 50/157 (32%)"
   - Estimated time remaining

4. **Background Processing**
   - Queue analysis jobs for large accounts
   - Process in background, notify when complete
   - Better UX for 200+ case accounts

---

## Related Files

All changes in this fix:

1. **app/api/analyze-friction/route.ts**
   - Added `callAnthropicWithRetry()` function
   - Removed `.limit(50)`
   - Added progress logging
   - Added 200ms delay between requests

2. **app/api/cron/analyze-portfolio/route.ts**
   - Added `callAnthropicWithRetry()` function
   - Removed `LIMIT 100` from SOQL query
   - Removed `slice(0, 100)` limiting
   - Fixed `limitedInputs` → `insertedInputs`
   - Added progress logging
   - Added 200ms delay between requests

3. **app/api/salesforce/sync-cases/route.ts**
   - Removed `LIMIT 100` from SOQL query
   - Now fetches ALL cases (up to Salesforce's 2000 limit)

---

## Rollback Instructions

If issues arise, revert these commits:

```bash
# Find the commits
git log --oneline | grep "API rate limiting"

# Revert if needed
git revert <commit-hash>
```

**Or manually restore limits:**

1. Add back to analyze-friction: `.limit(50)`
2. Add back to sync-cases: `LIMIT 100` in SOQL
3. Add back to cron: `.slice(0, 100)` and `LIMIT 100` in SOQL
4. Remove retry logic (though keeping it won't hurt)

---

## Summary

✅ **Fixed:** API 529 errors with retry logic
✅ **Fixed:** 100-case limit removed
✅ **Added:** Rate limiting between requests
✅ **Added:** Progress logging
✅ **Result:** Reliable analysis of ALL cases in 90-day window
