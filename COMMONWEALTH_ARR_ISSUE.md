# Commonwealth Storage ARR Issue - Status & Next Steps

## Problem
Commonwealth Storage and other non-Top 25 accounts are showing **$0 ARR** in Visit Planner, even though they have MRR data in Salesforce.

## What We've Fixed So Far ✅

1. **Database Infrastructure**
   - ✅ Created `encrypted_tokens` table for OAuth token storage
   - ✅ Applied migration: `20260212_create_encrypted_tokens_table.sql`
   - ✅ Added `ENCRYPTION_KEY` to Vercel environment variables

2. **Salesforce Connection**
   - ✅ Reconnected Salesforce with proper token encryption
   - ✅ Verified tokens are stored: `npx tsx scripts/verify-sf-connection.ts`
   - ✅ Integration ID: `1d4b40a7-bfe2-4fd6-895a-b5f78df3456b`
   - ✅ Last synced: 2026-02-12 17:24:40

3. **Code Improvements**
   - ✅ Expanded Salesforce sync from 200 to 2000 accounts
   - ✅ Removed MRR > 0 filter
   - ✅ Added filter for accounts with addresses: `(ShippingCity != null OR BillingCity != null)`
   - ✅ Fixed geocoding overwrite bug (coordinates no longer lost on sync)
   - ✅ All code deployed to Vercel

4. **Visit Planner**
   - ✅ Account list now shows under map in map view
   - ✅ Removed ARR > 0 filter from nearby accounts query

## Current Status 🔍

**Last Sync Result:**
- 826 accounts synced
- 1327 geocoded for Visit Planner

**Commonwealth Storage Status:**
- ARR: **$0** (should be ~$2,000 based on $164.24 MRR)
- Last Synced: 2026-02-10 (NOT updated in recent sync)
- Coordinates: 35.8831524, -78.6599907 ✓
- Address: Raleigh, NC ✓

**Why Commonwealth Wasn't Synced:**
Commonwealth is NOT being returned by the Salesforce API query. The sync query is:
```sql
SELECT ... FROM Account
WHERE (ShippingCity != null OR BillingCity != null)
ORDER BY MRR_MVR__c DESC NULLS LAST
LIMIT 2000
```

## Root Cause (Needs Investigation) 🔎

Commonwealth likely has **NULL for BOTH** `ShippingCity` AND `BillingCity` in Salesforce, even though the UI shows address data.

**To Verify in Salesforce:**
1. Go to Commonwealth Storage - CORP account
2. Check these fields:
   - `ShippingCity` - Is it NULL or empty?
   - `BillingCity` - Is it NULL or empty?
   - `MRR_MVR__c` - What's the value? (UI shows $164.24)

## Next Steps When You Return 📋

### Option 1: Fix Data in Salesforce (Recommended)
If ShippingCity/BillingCity are NULL:
1. Add city data to Commonwealth in Salesforce
2. Run sync again from Settings
3. Verify: `npx tsx scripts/check-commonwealth-direct.ts`

### Option 2: Modify Query to Include All Accounts
If we want to sync accounts without city data:

Edit `/Users/mario/friction-intelligence/app/api/salesforce/sync/route.ts` line 118:

**Current:**
```typescript
WHERE+(ShippingCity+!=+null+OR+BillingCity+!=+null)
```

**Change to:**
```typescript
WHERE+Id+!=+null
```

This will sync ALL accounts, not just those with cities. Then:
```bash
git add -A
git commit -m "Remove city requirement from Salesforce sync query"
git push origin main
```

Wait for Vercel deployment, then sync again.

### Option 3: Check Vercel Logs for Debug Info
Go to Vercel → Your Project → Deployments → Latest → Function Logs

Look for:
- "🔍 SALESFORCE FIELD DEBUG"
- "Commonwealth" in debug output
- "Total records returned:" (should say how many Salesforce returned)

This will show if Commonwealth was in the Salesforce response at all.

## Verification Scripts 🛠️

```bash
# Check if tokens are stored
npx tsx scripts/verify-sf-connection.ts

# Check Commonwealth current state
npx tsx scripts/check-commonwealth-direct.ts

# Check what was recently synced
npx tsx scripts/check-recent-syncs.ts

# Check integration status
npx tsx scripts/check-user-integrations.ts
```

## Files Modified in This Session 📁

- `supabase/migrations/20260212_create_encrypted_tokens_table.sql` - Token encryption infrastructure
- `app/api/salesforce/sync/route.ts` - Expanded to 2000 accounts, added address filter
- `app/visit-planner/page.tsx` - Added account list under map
- `components/SalesforceConnector.tsx` - Uses encrypted token storage
- Multiple diagnostic scripts in `/scripts/`

## Key Commits 🔄

- `1c86fb0` - Add encrypted_tokens table migration for OAuth token storage
- `434303e` - Show account list underneath map in Visit Planner map view
- `8527645` - Add Commonwealth Storage debugging to Salesforce sync
- `c5aae2f` - Expand Salesforce sync to include all accounts with addresses for Visit Planner
- `9e7e3bf` - Fix Salesforce sync overwriting Google-geocoded coordinates

## Summary

The OAuth token storage is working correctly. Salesforce sync is working. But Commonwealth (and likely other accounts) aren't being returned by Salesforce because they don't have city data, or the data exists in different fields than we're querying.

**Most Likely Fix:** Check Salesforce and ensure ShippingCity or BillingCity has a value for Commonwealth Storage - CORP.
