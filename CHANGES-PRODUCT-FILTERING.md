# Product-Specific Portfolio Changes

## Summary
Updated the application to:
1. **Filter out inactive clients** - Only sync accounts with MRR > 0
2. **Create product-specific portfolios** - Separate Top 25 lists for EDGE and SiteLink
3. **Exclude marketplace-only accounts** - Focus on software customers

## Changes Made

### 1. Salesforce Sync Endpoint (`app/api/salesforce/sync/route.ts`)

**Line 51**: Changed Salesforce query to only pull active clients
```typescript
// Before: MRR_MVR__c!=null (included $0 MRR accounts)
// After:  MRR_MVR__c>0 (only active paying clients)
WHERE ParentId=null AND MRR_MVR__c>0
```

**Lines 131-169**: Replaced generic "Top 25 by MRR" portfolio with product-specific portfolios
- **Top 25 EDGE Accounts**: Filters for accounts with `vertical` containing "EDGE"
- **Top 25 SiteLink Accounts**: Filters for accounts with `vertical` containing "SiteLink"
- Portfolio types: `top_25_edge` and `top_25_sitelink`

### 2. Cron Analysis Endpoint (`app/api/cron/analyze-portfolio/route.ts`)

**Line 32**: Updated to analyze both EDGE and SiteLink portfolios
```typescript
// Before: .eq('portfolio_type', 'top_25')
// After:  .in('portfolio_type', ['top_25_edge', 'top_25_sitelink'])
```

### 3. Dashboard (`app/dashboard/page.tsx`)

**Lines 50-62**: Updated portfolio loading to combine EDGE and SiteLink accounts
- Loads both `top_25_edge` and `top_25_sitelink` portfolios
- Combines account IDs and removes duplicates
- Shows all software accounts in one unified view

**Lines 254-263**: Updated sync progress tracking
- Queries both portfolio types
- Combines account IDs for accurate progress tracking

## What This Means

### Before
- **Top 25 by MRR**: Any account with MRR, regardless of product
- Included inactive accounts ($0 MRR)
- Included marketplace-only accounts
- Single generic portfolio

### After
- **Top 25 EDGE Accounts**: Only accounts using EDGE software (can have other products too)
- **Top 25 SiteLink Accounts**: Only accounts using SiteLink software (can have other products too)
- Only active paying clients (MRR > 0)
- Marketplace-only accounts are excluded (no EDGE or SiteLink)
- Dashboard shows combined view of both portfolios

### Example Account Filtering

| Account Name | Products | MRR | Included? | Why? |
|--------------|----------|-----|-----------|------|
| Acme Storage | EDGE, Marketplace | $5,000 | ✅ Yes | Has EDGE software |
| Beta Inc | SiteLink, Insurance | $3,000 | ✅ Yes | Has SiteLink software |
| Gamma LLC | EDGE, SiteLink | $8,000 | ✅ Yes (both) | Has both products |
| Delta Corp | Marketplace only | $2,000 | ❌ No | No software product |
| Simply Self Storage | EDGE | $0 | ❌ No | Inactive (MRR = $0) |

## Next Steps to Test

1. **Run Sync**: Click "Sync Now" on the dashboard to re-sync accounts with new filters
2. **Check Excluded**: Verify "Simply Self Storage" and other inactive accounts are removed
3. **Verify Portfolios**: Should see "Top 25 EDGE Accounts" and "Top 25 SiteLink Accounts" created
4. **Automated Analysis**: The cron will now analyze both portfolios (1 account every 20 minutes)

## Database Updates Needed

You may need to run this SQL in Supabase to clean up old portfolio types:

```sql
-- Check current portfolios
SELECT name, portfolio_type, created_at
FROM portfolios
ORDER BY created_at DESC;

-- Optional: Delete old "Top 25 by MRR" portfolio if it exists
DELETE FROM portfolios WHERE portfolio_type = 'top_25';
```

## Rollback Instructions

If you need to revert to the old behavior:

1. Change line 51 in `sync/route.ts` back to: `MRR_MVR__c!=null`
2. Replace lines 131-169 with the original single portfolio creation
3. Change line 32 in `analyze-portfolio/route.ts` back to: `.eq('portfolio_type', 'top_25')`
4. Revert dashboard changes to load single portfolio
