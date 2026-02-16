# Visit Planner Street Address Fix

## Problem

The visit planner shows "No street address" for many accounts, even though the accounts table has street addresses populated.

### Root Cause

The `find_nearby_accounts()` database function returns these fields:
- ✅ `property_address_city`
- ✅ `property_address_state`
- ❌ `property_address_street` (MISSING)
- ❌ `billing_address_street` (MISSING)
- ❌ `facility_count` (MISSING)

Test results showed:
- **66 out of 67 accounts** (99%) have street addresses in the database
- But the function doesn't return them, so the UI shows "No street address"

## Solution

Update the `find_nearby_accounts()` function to include street address fields.

### How to Apply the Fix

**Option 1: Through Supabase Dashboard (Recommended)**

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Copy the SQL from `supabase/migrations/20260216_add_street_addresses_to_visit_planner.sql`
5. Paste it into the SQL Editor
6. Click **Run**

**Option 2: Using psql (if you have direct database access)**

```bash
psql <your-connection-string> < supabase/migrations/20260216_add_street_addresses_to_visit_planner.sql
```

**Option 3: Using Supabase CLI (if project is linked)**

```bash
supabase db push --include-all
```

## What This Migration Does

1. Drops the existing `find_nearby_accounts()` function
2. Recreates it with additional return fields:
   - `property_address_street TEXT`
   - `property_address_postal_code TEXT`
   - `billing_address_street TEXT`
   - `billing_address_postal_code TEXT`
   - `facility_count INTEGER`

3. Updates the SELECT statement to return these fields from the accounts table

## Testing

After applying the migration, visit the planner should show street addresses:

```
Before: "No street address"
After:  "1234 Main St"
```

You can test with this script:
```bash
npx tsx scripts/test-nearby-accounts-fields.ts
```

Should output:
```
✓ property_address_street: EXISTS
✓ billing_address_street: EXISTS
✓ facility_count: EXISTS
```

## Files Changed

- ✅ Created: `supabase/migrations/20260216_add_street_addresses_to_visit_planner.sql`
- ✅ Created: `scripts/test-nearby-accounts-fields.ts` (for testing)
- ✅ Created: `scripts/check-missing-addresses.ts` (for diagnosis)

## Notes

- The Salesforce sync already fetches street addresses correctly ([salesforce/sync/route.ts:305-315](app/api/salesforce/sync/route.ts#L305-L315))
- The visit planner UI code already displays them correctly ([visit-planner/page.tsx:670,732](app/visit-planner/page.tsx#L670))
- Only the database function was missing the fields

## Impact

After applying this migration:
- Visit planner map view will show street addresses
- Visit planner list view will show street addresses
- No code changes needed - only the database function

---

**Status:** ⏳ Migration file created, waiting to be applied
**Date:** February 16, 2026
