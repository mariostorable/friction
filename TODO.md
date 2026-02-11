# Friction Intelligence - TODO

**Last Updated**: February 11, 2026

---

## 🔥 Immediate Actions (Do Today)

### 1. Run Jira Sync to Activate Client Field Linking
**Status**: Ready to run
**Priority**: HIGH
**What**: We just implemented Client(s) field extraction (customfield_12184) to improve account linking.

**Action**:
```bash
# Go to Settings → Integrations → Jira → Click "Sync Now"
# OR trigger via API:
curl -X POST http://localhost:3000/api/jira/sync \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "x-user-id: ab953672-7bad-4601-9289-5d766e73fec9"
```

**Expected Impact**:
- 11 West Coast tickets will link to "West Coast Self-Storage - CORP."
- 5 White Label tickets will link to "White Label Storage Management - CORP"
- 83 total tickets have Client field populated
- New high-confidence links (0.95) will replace low-confidence theme_association links (0.7)

**Files Changed**:
- `app/api/jira/sync/route.ts` (lines 432-468)

---

## 🚀 High Priority (This Week)

### 2. Verify West Coast Tickets Appear on Dashboard
**Status**: Pending Jira sync
**Priority**: HIGH

**What**: After Jira sync, verify that West Coast account now shows correct ticket count.

**Action**:
1. Navigate to Dashboard
2. Find "West Coast Self-Storage - CORP." account
3. Click to view account detail
4. Check "Jira Roadmap" tab
5. Verify tickets like EDGE-344, EDGE-4050, EDGE-623 appear

**Success Criteria**:
- West Coast account shows 11+ Jira tickets (up from 12 low-confidence links)
- Tickets display with "Client Field" match type
- Account OFI score may increase (more data = better signal)

### 3. Review and Improve Client Field Matching Logic
**Status**: Initial implementation done
**Priority**: MEDIUM

**Current Logic**:
- Bidirectional contains check: `accNameLower.includes(clientNameLower) || clientNameLower.includes(accNameLower)`
- This works for most cases but has false positives (e.g., "KO" matches 6 accounts)

**Potential Improvements**:
1. **Exact match priority**: Check exact match first, then fallback to contains
2. **Word boundary matching**: Use regex to avoid substring false positives
3. **Levenshtein distance**: Fuzzy matching for typos
4. **Manual mapping table**: For known aliases (e.g., "StorageMart" → "A-1 Storage Mart")

**Example Code**:
```typescript
// Improved matching with exact match priority
function matchClientToAccount(clientName: string, accountName: string): number {
  const clientLower = clientName.toLowerCase().trim();
  const accountLower = accountName.toLowerCase().trim();

  // Exact match (highest confidence)
  if (clientLower === accountLower) return 1.0;

  // Exact word match
  const clientWords = clientLower.split(/\s+/);
  const accountWords = accountLower.split(/\s+/);
  const intersection = clientWords.filter(w => accountWords.includes(w));
  if (intersection.length === clientWords.length) return 0.95;

  // Contains (current logic)
  if (accountLower.includes(clientLower) || clientLower.includes(accountLower)) {
    return 0.90;
  }

  return 0.0; // No match
}
```

### 4. Handle Missing Accounts (StorageMart, StorEase, etc.)
**Status**: Identified
**Priority**: MEDIUM

**Issue**: Some Client field values don't match any account:
- StorageMart
- StorEase
- Atomic Storage
- Attic Management Group

**Possible Reasons**:
1. Not in Top 25 portfolios (ARR too low)
2. Account status is "inactive" or "churned"
3. Account name in Salesforce is different (e.g., "A-1 Storage Mart" vs "StorageMart")

**Action**:
1. Query Salesforce for these account names
2. Check if they exist but are inactive
3. Create manual mapping table for aliases
4. OR expand portfolio to include these accounts

**Query**:
```sql
SELECT id, name, status, arr, vertical
FROM accounts
WHERE name ILIKE '%StorageMart%'
   OR name ILIKE '%StorEase%'
   OR name ILIKE '%Atomic Storage%'
   OR name ILIKE '%Attic Management%'
ORDER BY arr DESC;
```

---

## 📋 Medium Priority (This Month)

### 5. Implement Jira Custom Field Discovery UI
**Status**: API exists, UI needed
**Priority**: MEDIUM

**What**: Allow users to discover and map custom fields without hardcoding field IDs.

**Current State**:
- API endpoint exists: `GET /api/salesforce/discover-account-fields`
- Hardcoded `customfield_12184` for Client field

**Desired State**:
- Settings page with "Discover Custom Fields" button
- Shows table of all custom fields with sample values
- Allow user to select which field is "Client(s)" field
- Store mapping in `integrations.metadata`

**UI Mockup**:
```
Settings → Jira Integration → Custom Fields

[Discover Fields] button

Custom Field Mapping:
┌─────────────────────┬──────────────────────┬────────────────┐
│ Field ID            │ Sample Value         │ Mapping        │
├─────────────────────┼──────────────────────┼────────────────┤
│ customfield_12184   │ "West Coast, KO"     │ [Client Names] │
│ customfield_17254   │ "03755412 |"         │ [Salesforce Cases] │
│ customfield_12145   │ "Client reported"    │ (none)         │
└─────────────────────┴──────────────────────┴────────────────┘
```

### 6. Implement Multi-Jira Instance Support
**Status**: Not started
**Priority**: MEDIUM

**What**: Support multiple Jira instances per user (EDGE, SL, MREQ, etc.)

**Current Limitation**:
- One Jira integration per user
- All tickets go into same pool

**Desired State**:
- Multiple Jira integrations per user
- Each has own `instance_url` and project keys
- UI shows "Add Another Jira Instance"
- Tickets tagged with source instance

**Database Changes**:
```sql
-- Add instance_name to integrations
ALTER TABLE integrations
ADD COLUMN instance_name text;

-- Update unique constraint
DROP CONSTRAINT integrations_user_id_integration_type_key;
CREATE UNIQUE INDEX integrations_user_integration_instance
ON integrations (user_id, integration_type, instance_name);
```

### 7. Add Jira Issue Status Tracking
**Status**: Data exists, UI needed
**Priority**: MEDIUM

**What**: Show how many Jira issues are "Open" vs "In Progress" vs "Done"

**Data Available**:
- `jira_issues.status` (Open, In Progress, Done, etc.)
- `jira_issues.resolution` (Fixed, Won't Fix, etc.)

**UI Location**:
- Account detail page → Jira Roadmap tab
- Add status breakdown chart

**Mockup**:
```
Jira Issue Status
┌──────────────┬───────┐
│ Open         │ 23 ██ │
│ In Progress  │ 12 █  │
│ Done         │ 45 ███│
└──────────────┴───────┘
```

### 8. Improve Jira Theme Matching
**Status**: Works but can improve
**Priority**: MEDIUM

**Current Logic**:
- Keyword matching on summary/description
- Label matching
- Component matching

**Improvement Ideas**:
1. **Machine Learning**: Train model on labeled examples
2. **Semantic Search**: Use embeddings to find similar themes
3. **Multi-label Classification**: One ticket can have multiple themes
4. **Confidence Thresholds**: Only link if confidence > 0.7

**Example**:
```
Ticket: "Customer can't process payment due to surcharge error"

Current: Matches "performance_issues" (keyword: "process")
Improved: Should match "billing_confusion" (semantic similarity to payment/surcharge)
```

---

## 🔮 Long-Term (Next Quarter)

### 9. Zendesk Integration
**Status**: Not started
**Priority**: LOW

**What**: Sync Zendesk tickets as additional friction signal source

**Requirements**:
1. OAuth connection to Zendesk
2. Ticket sync API similar to Jira
3. Map Zendesk organizations to Salesforce accounts
4. Store tickets in `raw_inputs` with `source_type='zendesk'`

### 10. Gong Call Transcript Integration
**Status**: Not started
**Priority**: LOW

**What**: Analyze sales call transcripts for friction signals

**Requirements**:
1. Gong API access
2. Call transcript extraction
3. Speaker diarization (customer vs sales rep)
4. Sentiment analysis
5. Theme extraction from conversation

### 11. Slack/Email Alerts for Friction Spikes
**Status**: Not started
**Priority**: LOW

**What**: Notify CSMs when OFI score spikes for their accounts

**Requirements**:
1. Alert rules engine
2. Slack webhook integration
3. Email notification system (SendGrid/Postmark)
4. User preference settings

**Example Alert**:
```
🚨 Friction Alert: West Coast Self-Storage

OFI Score: 67 → 89 (+33%)
New Issues: 3 high-severity friction cards
Top Theme: Integration Failures
Action: Review account and schedule call
[View Account] [Dismiss]
```

### 12. Multi-User Collaboration
**Status**: Foundation exists, UI needed
**Priority**: LOW

**What**: Allow teams to share accounts and collaborate on friction analysis

**Features**:
1. Team workspaces (multiple users per account)
2. Shared portfolios
3. Comments on friction cards
4. Assignment of action items
5. Role-based access control

---

## 🐛 Known Bugs

### Bug 1: EDGE-4200 Not Found
**Status**: Won't fix (expected behavior)
**Priority**: N/A

**Issue**: User's PDF shows EDGE-4200 but it's not in database

**Reason**: Ticket is older than 90-day sync window

**Solution**: Increase sync window if needed, but this will slow down syncs
```typescript
// In /app/api/jira/sync/route.ts
const jql = `updated >= -180d ORDER BY updated DESC`; // 6 months instead of 90 days
```

### Bug 2: Duplicate Account Links
**Status**: Monitoring
**Priority**: LOW

**Issue**: Some tickets might get linked to same account multiple times via different strategies

**Current Mitigation**: Database unique constraint on `(account_id, jira_issue_id)`

**Desired State**: Track all match types but de-duplicate in UI

---

## 📝 Maintenance Tasks

### Daily
- [ ] Check integration health: `GET /api/integrations/health`
- [ ] Verify cron jobs ran successfully (Vercel logs)
- [ ] Monitor error rates in Vercel dashboard

### Weekly
- [ ] Review unprocessed raw_inputs: `SELECT count(*) FROM raw_inputs WHERE processed=false`
- [ ] Check for stale integrations: `SELECT * FROM integrations WHERE last_synced_at < now() - interval '7 days'`
- [ ] Refresh OAuth tokens if needed

### Monthly
- [ ] Review and archive old snapshots: `DELETE FROM account_snapshots WHERE snapshot_date < now() - interval '6 months'`
- [ ] Clean up old shared links: `DELETE FROM shared_links WHERE expires_at < now()`
- [ ] Database vacuum and analyze: `VACUUM ANALYZE`

---

## 🎯 OKRs / Success Metrics

### Key Metrics to Track

1. **Data Coverage**
   - % of accounts with friction signals
   - % of accounts with Jira tickets linked
   - Days since last sync per integration

2. **AI Quality**
   - Average confidence score per friction card
   - % of cards marked as friction vs normal support
   - User feedback on AI analysis quality

3. **User Engagement**
   - DAU/MAU (daily/monthly active users)
   - Avg session duration
   - Most viewed accounts
   - Briefings generated per week

4. **Friction Trends**
   - Avg OFI score across portfolio
   - % of accounts with increasing friction
   - Top friction themes across accounts

### Current Baseline (Feb 11, 2026)

- **Accounts**: 1000 total, 52 in Top 25 portfolios
- **Friction Cards**: Unknown (need to query)
- **Jira Tickets**: ~1000 synced, 83 with Client field
- **Integrations**: Salesforce ✅, Jira ✅, Vitally ✅
- **Sync Frequency**: Daily (via cron)

---

## 📚 Documentation Needs

### User-Facing
- [ ] Onboarding guide (how to connect integrations)
- [ ] OFI score explanation (what it means, how it's calculated)
- [ ] Friction theme definitions (what each theme means)
- [ ] Visit Planner usage guide
- [ ] Briefing generation tips

### Developer-Facing
- [x] CLAUDE.md (comprehensive developer guide)
- [x] TODO.md (this file)
- [ ] API documentation (Swagger/OpenAPI spec)
- [ ] Database schema diagram
- [ ] Deployment guide (Vercel + Supabase setup)

---

## 🚫 Out of Scope (For Now)

These are ideas to explicitly NOT pursue yet:

1. **Predictive Churn Modeling** - Requires more historical data
2. **Multi-Tenant SaaS** - Single-user focus for now
3. **Mobile App** - Web-first approach
4. **Advanced Analytics** - Focus on core friction detection first
5. **Custom Dashboards** - Standardized views are sufficient

---

## Recent Completions (Feb 11, 2026)

### ✅ Completed Today

1. **Fixed Dashboard Account Display**
   - Removed non-existent columns from query
   - Dashboard now shows 52 active accounts correctly
   - Commits: b6ab5c7, a57a5f3, 7310130

2. **Fixed Friction Theme Filtering**
   - Added `is_friction=true` filter to analyze-portfolio cron
   - "Normal Support" and "Other" categories removed from themes
   - Commit: ead3042

3. **Implemented Jira Client Field Extraction**
   - Identified customfield_12184 as Client(s) field
   - Implemented parsing and account matching
   - Added high-confidence linking (0.95)
   - Found 11 West Coast + 5 White Label tickets to link
   - Commit: 7894fef

4. **Fixed RLS Warnings**
   - Enabled RLS on themes table
   - Added service role bypass
   - Migration: 20260211_enable_rls_themes_and_spatial.sql

5. **Created Comprehensive Documentation**
   - CLAUDE.md (developer guide)
   - TODO.md (this file)

---

**Next Session**: Run Jira sync and verify West Coast tickets appear correctly!
