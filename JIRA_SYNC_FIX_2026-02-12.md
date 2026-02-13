# Jira Sync Fix - February 12, 2026

## Problem Summary

**21 out of 67 accounts showed "0 / 0 / 0" Jira tickets** on the dashboard despite having friction themes that matched Jira tickets.

### Examples of Affected Accounts:
- William Warren Group (19 friction themes) - showed 0/0/0
- KO Storage (150 friction themes) - showed 0/0/0
- Suntex (76 friction themes) - showed 0/0/0
- And 18 more accounts...

### Additional Issue:
- Dashboard showed "Resolved (30d)" but user wanted "Resolved (90d)" for better visibility into recent fixes

## Root Cause

Located in `app/api/jira/sync/route.ts` lines 651-665:

```typescript
// OLD CODE - FILTERING OUT ACCOUNTS
const hasAccountMatch = nameParts.some(part => searchText.includes(part));

if (hasAccountMatch) {
  // Create link with high confidence
} else {
  filteredOutCount++;  // ACCOUNT GETS SKIPPED!
}
```

**The Problem:** The sync required the account name to appear in the Jira ticket text for theme-based linking. William Warren's themes matched 54 Jira tickets, but "William Warren" didn't appear in those tickets, so NO links were created.

### Investigation Results:

We discovered that:
- 237 Jira issues in database (NBK, EDGE, SL, PAY, CRM projects)
- 528 account-jira links existed, but only for 20 accounts
- 47 accounts showed 0/0/0
- Of those 47:
  - 21 HAD friction themes (ready to match)
  - 26 had NO themes (need Salesforce sync)

William Warren example:
- Has 19 friction themes
- Those themes ARE linked to 54 Jira tickets in `theme_jira_links` table
- Those 54 tickets have `account_jira_links` for 28 OTHER accounts
- But William Warren is NOT in `account_jira_links` because name filtering excluded it

## Changes Deployed

### 1. Fixed Jira Sync Logic (app/api/jira/sync/route.ts)

**Lines 651-671:** Now creates theme-based links even without account name match:

```typescript
// NEW CODE - TWO-TIER MATCHING
if (hasAccountMatch) {
  // High confidence: both theme AND name match
  themeBasedAccountLinks.push({
    user_id: userId,
    account_id: accountId,
    jira_issue_id: themeLink.jira_issue_id,
    match_type: 'theme_and_name',
    match_confidence: 0.85
  });
} else {
  // Medium confidence: theme matches, but account name not in ticket
  // Still create link to provide Jira visibility for accounts with friction themes
  themeBasedAccountLinks.push({
    user_id: userId,
    account_id: accountId,
    jira_issue_id: themeLink.jira_issue_id,
    match_type: 'theme_association',
    match_confidence: 0.6 // Lower confidence without name match
  });
  filteredOutCount++;
}
```

### 2. Changed Resolved Window from 30d to 90d

**Files Modified:**
- `app/api/jira/portfolio-stats/route.ts` - Backend API
- `app/api/accounts/[id]/jira-summary/route.ts` - Account detail API
- `app/dashboard/page.tsx` - Dashboard display
- `components/JiraRoadmapSummary.tsx` - Roadmap component
- `components/JiraPortfolioOverview.tsx` - Portfolio overview cards

**Changes:**
- Type definitions: `resolved_30d` → `resolved_90d`
- Date calculations: `thirtyDaysAgo` → `ninetyDaysAgo`
- UI labels: "Resolved (30d)" → "Resolved (90d)"
- Descriptions: "last 30 days" → "last 90 days"

## Deployment Status

✅ **Code Changes:** Pushed to production
- Commit: `f1be928` - Main sync fix + 90d changes
- Commit: `11cd13a` - JiraPortfolioOverview 90d fix

✅ **Vercel Deployment:** Auto-deploying (takes 2-3 minutes)

❌ **Data Sync:** NOT YET RUN - Database still has old links

## What Needs to Happen Next

### CRITICAL: Must Re-sync Jira

**The new code is live, but the database still has old account-jira links.**

**Steps:**
1. Go to https://friction-intelligence.vercel.app/dashboard
2. Click "Sync Jira" button (top right)
3. Wait ~30-60 seconds for sync to complete
4. Refresh the page

### Expected Results After Sync:

**Dashboard Portfolio Overview:**
- ✅ "Resolved (90d)" label (instead of "Resolved (30d)")
- ✅ Resolved count increases (was showing 0, should show tickets from last 90 days)
- ✅ More accounts show non-zero Jira ticket counts

**Dashboard Account List:**
- ✅ Column header: "Jira Tickets" tooltip says "resolved (90d) / in progress / open"
- ✅ 21 accounts that showed "0 / 0 / 0" now show actual counts:
  - William Warren Group: Should show ~20-30 tickets
  - KO Storage: Should show many tickets (has 150 themes!)
  - Suntex: Should show ~30-40 tickets
  - Etc.

**Account Detail Pages:**
- ✅ "Recent Fixes" section shows fixes from last 90 days (was 30 days)
- ✅ Accounts like William Warren show Jira roadmap instead of empty state

**Jira Roadmap Page (`/roadmap`):**
- ✅ "By Account" tab populates with ~41 accounts (was 20)
- ✅ Accounts with `theme_association` links show with medium confidence

## Technical Details

### Database Schema

Tables involved:
- `jira_issues` - All Jira tickets (237 total)
- `theme_jira_links` - Maps themes to Jira tickets (already working correctly)
- `account_jira_links` - Maps accounts to Jira tickets (THIS is what the fix improves)

### Match Types in account_jira_links:

| Match Type | Confidence | Description |
|------------|-----------|-------------|
| `client_field` | 0.95 | Explicit client name in Jira custom field (only 6 links use this) |
| `salesforce_case` | 1.0 | Direct Salesforce case ID match (0 found - case IDs don't overlap) |
| `theme_and_name` | 0.85 | Theme match + account name in ticket (91 links before fix) |
| `theme_association` | 0.6 | Theme match only, name not in ticket (NEW - will create ~hundreds of links) |

### Why Case ID Matching Didn't Work

We investigated using Salesforce Case IDs to link Jira tickets:
- Found `customfield_17254` in some Jira tickets with case IDs (e.g., SLT-9281)
- BUT: Those case IDs (03769868, 03766589, etc.) don't exist in our Salesforce data
- Our Salesforce has different cases (03726434, 03735450, etc.)
- Conclusion: Jira tickets and Salesforce cases are from different time periods or instances

### Diagnostic Scripts Created

Location: `/scripts/`

Key scripts for future debugging:
- `check-theme-jira-links.ts` - Check theme → Jira → account link chain
- `check-accounts-without-jira.ts` - Find accounts that should have Jira but don't
- `test-client-field-matching.ts` - Test client field effectiveness
- `analyze-current-links-fixed.ts` - Analyze current account-jira links by match type
- `inspect-edge-tickets.ts` - Inspect Jira ticket content and custom fields

## Validation Checklist

After running Jira sync, verify:

- [ ] Dashboard portfolio overview shows "Resolved (90d)"
- [ ] Resolved count > 0 (should be ~10-20 depending on recent fixes)
- [ ] Dashboard account list: William Warren shows X / Y / Z (not 0/0/0)
- [ ] Dashboard account list: KO Storage shows X / Y / Z (not 0/0/0)
- [ ] Click into William Warren account → See "Jira Roadmap" section populated
- [ ] Go to /roadmap → "By Account" tab shows ~41 accounts (was 20)
- [ ] Check database: `SELECT count(*) FROM account_jira_links WHERE match_type = 'theme_association'` should be > 0

## Rollback Plan (If Needed)

If the new matching creates too many false positives:

```bash
# Revert to previous commit
git revert 11cd13a f1be928
git push origin main

# OR: Just delete theme_association links
DELETE FROM account_jira_links WHERE match_type = 'theme_association';
```

Then adjust the confidence threshold or add additional filters.

## Future Improvements

1. **Populate `customfield_12184`** in Jira for more client field matches (only 15/237 tickets have it)
2. **Investigate Looker CSV source** - Figure out why Looker shows more client associations than our sync
3. **Sync more history** - Currently syncing 180 days of Jira updates, could expand to 365 days
4. **Add account name aliases** - Help matching when account names vary (e.g., "William Warren" vs "WW Group")

## Contact

If issues arise:
- Check Vercel logs for sync errors
- Run diagnostic scripts in `/scripts/`
- Review `app/api/jira/sync/route.ts` sync logic
- Verify RLS policies aren't blocking user access

---

**Status:** ✅ Code deployed, ⏳ Waiting for Jira sync to be triggered
**Last Updated:** February 12, 2026
**Author:** Claude (Sonnet 4.5) + Mario
