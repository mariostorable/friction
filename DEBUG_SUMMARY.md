# Debug Summary - Two Issues to Fix

## 1. ✅ Visit Planner Fix (READY TO APPLY)

### Error
```
Error: Database error - column reference "ofi_score" is ambiguous
```

### Solution
Run this migration in **Supabase SQL Editor**:

**File**: `supabase/migrations/20260209_fix_visit_planner_ofi_ambiguous.sql`

The migration explicitly qualifies `account_snapshots.ofi_score` to avoid ambiguity.

**Action**: Copy the SQL from that file and run it in Supabase dashboard.

---

## 2. 🔍 Jira Theme Linking Issue (NEEDS INVESTIGATION)

### Symptom
- ✅ 1474 Jira issues successfully synced
- ✅ Keyword matching finds 63 tickets matching 15 themes
- ❌ But `theme_jira_links` table shows **0 rows**

### Root Cause
The sync code is likely failing silently - no error is logged, but links aren't created.

### Possible Issues
1. **Database constraint mismatch** - The upsert `onConflict` key might not match the actual table constraint
2. **Silent error** - Error isn't being logged, so failure goes unnoticed
3. **Empty result set** - `insertedIssues` might be null/empty due to permissions or RLS policy
4. **Incorrect data format** - Link objects might be missing required fields

### Investigation Steps

#### Step 1: Check Database Constraints
Run in **Supabase SQL Editor**:

```sql
SELECT
  conname as constraint_name,
  contype as type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'theme_jira_links'::regclass;
```

**Expected**: UNIQUE constraint on `(user_id, jira_issue_id, theme_key)`
**If different**: Update the sync code's `onConflict` parameter to match

#### Step 2: Test Manual Insert
Run in **Supabase SQL Editor**:

```sql
-- Try inserting a test link
INSERT INTO theme_jira_links (
  user_id,
  jira_issue_id,
  theme_key,
  jira_key,
  match_type,
  confidence
)
SELECT
  user_id,
  id,
  'access_permissions',
  jira_key,
  'test',
  0.9
FROM jira_issues
WHERE summary ILIKE '%password%' OR summary ILIKE '%login%'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Check if it worked
SELECT * FROM theme_jira_links ORDER BY created_at DESC LIMIT 5;
```

**If this works**: Database permissions are OK, issue is in sync code
**If this fails**: There's a database schema or permissions problem

#### Step 3: Add Error Logging to Sync Code

Follow instructions in **`JIRA_SYNC_FIX.md`** to add comprehensive error logging.

After applying the fix:
1. Restart your dev server
2. Trigger a new Jira sync from dashboard
3. Check server logs for error messages
4. Share the log output

#### Step 4: Run Additional Diagnostics

These queries are in **`scripts/debug-jira-linking-mismatch.sql`**:

```sql
-- Query 4: Test Case ID extraction and matching
-- (Shows if Jira case IDs match friction_cards case IDs)

-- Query 5: Check theme_jira_links table status
-- (Verifies table exists and structure)

-- Query 6: Check table constraints
-- (Lists all constraints on theme_jira_links)
```

### Quick Win: Manual Link Creation

If you want to test the UI with links while debugging, manually create some links:

```sql
-- Create links for all Jira tickets that mention "billing"
INSERT INTO theme_jira_links (user_id, jira_issue_id, theme_key, jira_key, match_type, confidence)
SELECT
  user_id,
  id,
  'billing_confusion',
  jira_key,
  'manual',
  0.9
FROM jira_issues
WHERE summary ILIKE '%billing%' OR description ILIKE '%billing%'
ON CONFLICT DO NOTHING;

-- Create links for all tickets mentioning "integration"
INSERT INTO theme_jira_links (user_id, jira_issue_id, theme_key, jira_key, match_type, confidence)
SELECT
  user_id,
  id,
  'integration_failures',
  jira_key,
  'manual',
  0.9
FROM jira_issues
WHERE summary ILIKE '%integration%' OR summary ILIKE '%api%' OR summary ILIKE '%sync%'
ON CONFLICT DO NOTHING;

-- Verify
SELECT COUNT(*) as total_links FROM theme_jira_links;
```

---

## Files Created for You

1. **`JIRA_LINKING_DEBUG.md`** - Comprehensive diagnostic info and queries
2. **`JIRA_SYNC_FIX.md`** - Step-by-step patch to add error logging to sync
3. **`DEBUG_SUMMARY.md`** - This file (high-level overview)
4. **`scripts/debug-jira-linking-mismatch.sql`** - Fixed SQL diagnostic queries
5. **`supabase/migrations/20260209_fix_visit_planner_ofi_ambiguous.sql`** - Visit Planner fix

---

## Recommended Action Plan

### Immediate (5 minutes)
1. ✅ **Fix Visit Planner** - Run the migration from `20260209_fix_visit_planner_ofi_ambiguous.sql`
2. 🔍 **Check constraint** - Run the constraint query from Step 1 above
3. 🧪 **Test manual insert** - Run the manual insert query from Step 2 above

### If Manual Insert Works (10 minutes)
1. Apply the error logging patch from `JIRA_SYNC_FIX.md`
2. Trigger a new Jira sync
3. Check logs for error messages
4. Share the logs so I can diagnose the exact issue

### If Manual Insert Fails (Database Issue)
1. Check table exists: `SELECT * FROM theme_jira_links LIMIT 1;`
2. Check permissions: Verify your user has INSERT permission
3. May need to create/recreate the table with correct schema

---

## Quick Diagnostic Results You Shared

From your earlier test:
- ✅ **16 friction themes** exist in database
- ✅ **63 Jira tickets** match themes via keywords
- ✅ **15 unique themes** matched
- ✅ **159 Jira tickets** contain Salesforce Case IDs
- ✅ **2529 friction cards** linked to 1861 Salesforce cases
- ❌ **0 theme links** created

**Conclusion**: All the data exists, matching logic works, but database inserts are failing silently.

Most likely cause: **Database constraint mismatch or silent error in sync code**.
