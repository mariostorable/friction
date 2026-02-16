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

**UPDATED (After MREQ-7606 discovery):** Added product/vertical filtering:

```typescript
// Product/vertical filtering: prevent cross-industry linking
const jiraProject = issueDetails.jira_key.split('-')[0];
const accountProducts = accountIdToProducts.get(accountId)?.toLowerCase() || '';

// Marine projects: MREQ, TOPS, BZD (Boatyard), EASY (EasyStart Marine)
const isMarineProject = ['mreq', 'tops', 'bzd', 'easy'].includes(jiraProject.toLowerCase());
const isMarineAccount = accountProducts.includes('dockwa') || accountProducts.includes('marina');

// Storage projects: EDGE, SL, SLT, PAY, CRM, DATA, BUGS
const isStorageProject = ['edge', 'sl', 'slt', 'pay', 'crm', 'data', 'bugs'].includes(jiraProject.toLowerCase());
const isStorageAccount = accountProducts.includes('edge') || accountProducts.includes('sitelink') || accountProducts.includes('storable');

// Skip cross-industry matches for theme_association (low confidence) links
const isCrossIndustry = (isMarineProject && isStorageAccount) || (isStorageProject && isMarineAccount);

if (hasAccountMatch) {
  // High confidence: Allow even if cross-industry since name match is strong signal
  create theme_and_name link...
} else if (!isCrossIndustry) {
  // Only create theme_association if same industry
  create theme_association link...
} else {
  // Skip: cross-industry match with no name confirmation
  filteredOutCount++;
}
```

This prevents false positives like:
- ❌ Marine boat rental tickets → Storage companies
- ❌ Storage software bugs → Marina operators
- ✅ Marine tickets → Marine accounts only
- ✅ Storage tickets → Storage accounts only

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
- Commit: `f86714b` - Documentation
- Commit: `54a0569` - **Cross-industry filtering (CRITICAL)**

✅ **Vercel Deployment:** Auto-deploying (takes 2-3 minutes)

❌ **Data Sync:** NOT YET RUN - Database still has old links

### Additional Fix: Cross-Industry Filtering

**Issue Found:** After initial deployment, discovered marine tickets (MREQ-7606) were linking to storage accounts through generic themes.

**Example:** "Okanagan Lake Boat Rentals" (marine) was linked to 23 storage companies like Westport Properties, Crystal View Capital, etc.

**Root Cause:** Generic themes like "other" and "support_response_time" match across industries, creating false positives.

**Solution Added:**
- Marine projects (MREQ, TOPS, BZD, EASY) only create `theme_association` links to marine accounts (Dockwa/Marina products)
- Storage projects (EDGE, SL, SLT, PAY, CRM, DATA, BUGS) only link to storage accounts (EDGE/SiteLink products)
- `theme_and_name` links still allowed cross-industry (high confidence with name match)

## What Needs to Happen Next

### CRITICAL: Must Re-sync Jira (UPDATED Feb 16, 2026)

**UPDATE Feb 16, 2026 4:55 PM:** The initial sync on Feb 16 ran with OLD code (before RLS fixes were deployed), creating 71 bad cross-industry links (marine tickets → storage accounts). These have been deleted.

**Cross-Industry Links Removed:**
- MREQ-7606 (Okanagan Lake Boat Rentals) was linked to 23 storage accounts
- BZD-1005 (Access Control | Hardware Assets) was linked to 23 storage accounts
- EASY-324 (Update SSO Branding) was linked to 23 storage accounts
- EASY-298 was linked to 3 storage accounts
- **Total deleted: 71 incorrect links**

**Steps:**
1. ✅ DONE: Deleted 71 cross-industry links
2. ⏳ WAITING: For Vercel to deploy latest code (commit cbf6e4b)
3. **TODO: Click "Sync Jira" button AGAIN** to recreate links with proper filtering
4. Refresh the page

**Why another sync is needed:** The Feb 16 sync ran before the RLS fixes and portfolio filtering were deployed to production.

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

## February 16, 2026 Update - Cross-Industry Cleanup

### Issues Found

User reported Westport Properties (storage company) showing marine tickets:
- MREQ-7606: Okanagan Lake Boat Rentals (completely unrelated to storage)
- BZD-1005: Access Control hardware for marine industry
- EASY-324: Marine SSO branding updates

### Root Cause

The Feb 16 Jira sync ran BEFORE the RLS fixes were deployed to production. At that time:
- ✅ Cross-industry filtering code was committed (commit 54a0569)
- ❌ But Vercel hadn't deployed it yet
- ❌ Sync ran with old code, creating 71 bad cross-industry links

### Fix Applied

**Feb 16, 4:55 PM:**
1. Created `scripts/clean-cross-industry-links.ts` to identify and delete bad links
2. Deleted 71 cross-industry links:
   - MREQ-7606 → 23 storage accounts
   - BZD-1005 → 23 storage accounts
   - EASY-324 → 23 storage accounts
   - EASY-298 → 2 storage accounts

3. Updated documentation to clarify sync needs to run again after deployment
4. Committed cleanup script for future reference

### Additional Fixes

**Roadmap RLS Issue:**
- Fixed roadmap API to use service role client (bypasses RLS for joins)
- Fixed account detail Jira summary API same way
- Changed roadmap to only query portfolio accounts (67 instead of 1000)

**Commits:**
- `cbf6e4b` - Fix roadmap to only query portfolio accounts
- `37221b2` - Fix account detail page Jira roadmap RLS issue
- `038fae2` - Fix roadmap by account RLS issue preventing joins

### Next Steps

1. Wait for Vercel deployment (commits above)
2. Run Jira sync again from dashboard
3. Verify no marine tickets appear for storage accounts
4. Verify roadmap "By Account" tab populates correctly

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
