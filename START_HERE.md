# 🚀 START HERE - Debug Issues Fixed While You Were Away

## 📊 Summary

While you were away, I investigated both issues and prepared comprehensive fixes:

### ✅ Issue #1: Visit Planner - READY TO FIX
**Error**: `"ofi_score is ambiguous"`
**Status**: Fix ready, just needs to be applied
**Time to fix**: 30 seconds

### 🔍 Issue #2: Jira Theme Linking - NEEDS ONE MORE STEP
**Error**: 0 theme links despite keyword matches
**Status**: Diagnostic ready, need to run one SQL query
**Time to diagnose**: 2 minutes

---

## 🎯 Quick Action Plan (5 minutes total)

### Step 1: Fix Visit Planner (30 seconds)

1. Open **Supabase Dashboard** → SQL Editor
2. Copy the contents of: `supabase/migrations/20260209_fix_visit_planner_ofi_ambiguous.sql`
3. Paste and run in SQL Editor
4. ✅ Visit Planner should now work!

---

### Step 2: Diagnose Jira Linking (2 minutes)

1. Open **Supabase Dashboard** → SQL Editor
2. Copy the contents of: `scripts/quick-jira-diagnostic.sql`
3. Paste and run in SQL Editor (it runs 7 diagnostic queries at once)
4. **Share the results** - they'll show exactly what's wrong

The diagnostic will tell us if:
- The database constraint is correct
- Manual inserts work (= sync code issue)
- Manual inserts fail (= database issue)
- What the exact error is

---

## 📁 Files Created For You

| File | Purpose |
|------|---------|
| **`START_HERE.md`** | This file - your starting point |
| **`DEBUG_SUMMARY.md`** | High-level overview of both issues |
| **`JIRA_LINKING_DEBUG.md`** | Deep dive on Jira linking problem |
| **`JIRA_SYNC_FIX.md`** | Code patch to add error logging |
| **`scripts/quick-jira-diagnostic.sql`** | Run this in Supabase! |
| **`scripts/debug-jira-linking-mismatch.sql`** | Individual diagnostic queries |
| **`supabase/migrations/20260209_fix_visit_planner_ofi_ambiguous.sql`** | Visit Planner fix |

---

## 🎯 What I Found

### Visit Planner Issue
The `find_nearby_accounts` function had an ambiguous column reference. Both `accounts` and `account_snapshots` tables have an `ofi_score` column, and PostgreSQL couldn't determine which one to use.

**Fix**: Explicitly qualify the column as `account_snapshots.ofi_score` in the LATERAL join.

### Jira Linking Issue
Your diagnostic query showed:
- ✅ **63 Jira tickets** match themes via keywords
- ✅ **15 unique themes** found
- ✅ **159 Jira tickets** have Salesforce Case IDs
- ❌ **0 links** created in database

This means:
1. The data exists
2. The matching logic works
3. But database inserts are failing silently

**Most likely causes**:
- Database constraint mismatch (wrong `onConflict` key)
- Silent error not being logged
- Permissions issue preventing inserts

The diagnostic SQL will pinpoint the exact issue.

---

## 🆘 If You Need Help

After running the diagnostic SQL (`scripts/quick-jira-diagnostic.sql`), share the results and I can:
1. Identify the exact problem
2. Provide a targeted fix
3. Get your Jira links working

---

## 📝 Next Steps After Fixes

Once both issues are resolved:

1. **Test Visit Planner**:
   - Go to `/visit-planner`
   - Search for "Austin, TX"
   - Should see nearby accounts on map

2. **Test Jira Linking**:
   - Go to `/settings` → Integrations
   - Run Jira sync
   - Check if "Jira Theme Links" shows >0
   - Go to dashboard → Click on a friction theme
   - Should see related Jira tickets

3. **Verify Account Support Roadmap**:
   - Go to an account page (`/account/[id]`)
   - Scroll to "Support Roadmap" section
   - Should see Jira tickets grouped by status

---

## 🚀 Ready to Go?

1. **Fix Visit Planner** → Run the migration
2. **Run Jira diagnostic** → Run quick-jira-diagnostic.sql
3. **Share results** → I'll provide the final fix

You've got this! 💪
