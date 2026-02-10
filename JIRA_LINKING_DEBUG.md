# Jira Theme Linking Debug Report

## Problem Summary
- **Symptom**: 1474 Jira issues synced, but 0 theme links created
- **Diagnostic Result**: Keyword matching DOES find matches (63 tickets matched 15 themes), but links aren't being saved to database
- **Root Cause**: Likely silent database error or constraint mismatch

## Diagnostic Results

### ✅ What's Working
1. **Jira Sync**: Successfully fetching and storing 1474 Jira issues
2. **Keyword Matching**: 63 tickets match 15 themes via keyword analysis
3. **Data Exists**: 159 Jira tickets have Salesforce Case IDs, 2529 friction cards exist with case references

### ❌ What's Broken
1. **Link Creation**: `theme_jira_links` table has 0 rows
2. **Silent Failure**: No error logs visible, sync reports success but creates no links

## Likely Issues

### Issue #1: Database Constraint Mismatch
The sync code uses this conflict key:
```typescript
.upsert(themeLinksToCreate, {
  onConflict: 'user_id,jira_issue_id,theme_key',
  ignoreDuplicates: true
})
```

**Action Required**: Run this query to check actual constraints:
```sql
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'theme_jira_links'::regclass;
```

If the unique constraint is different (e.g., just `jira_issue_id,theme_key` without `user_id`), the upsert will fail.

### Issue #2: Silent Error Handling
The code doesn't check for errors after the upsert:
```typescript
const { data: createdThemeLinks } = await supabaseAdmin
  .from('theme_jira_links')
  .upsert(themeLinksToCreate, { ... })
  .select();
linksCreated = createdThemeLinks?.length || themeLinksToCreate.length;
```

**Problem**: If upsert fails, `createdThemeLinks` is null, but the code falls back to `themeLinksToCreate.length`, reporting success without actually creating links.

### Issue #3: Empty insertedIssues
If the `.select()` after upsert doesn't return data (e.g., due to RLS policy or permissions), `insertedIssues` could be empty, so no links would be attempted.

## Queries to Run

### 1. Check theme_jira_links table structure
```sql
-- Check constraints
SELECT
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'theme_jira_links'::regclass;

-- Check table structure
\d theme_jira_links
```

### 2. Test manual insert
```sql
-- Try inserting a test link manually
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
WHERE summary ILIKE '%password%'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Check if it was inserted
SELECT * FROM theme_jira_links LIMIT 5;
```

### 3. Check if case ID matching would work
```sql
-- Test if Jira case IDs match friction_cards case IDs
WITH jira_cases AS (
  SELECT
    ji.id,
    ji.jira_key,
    regexp_matches(
      (ji.metadata->'custom_fields')::text,
      '\d{8}',
      'g'
    )[1] as case_number
  FROM jira_issues ji
  WHERE (ji.metadata->'custom_fields')::text ~ '\d{8}'
  LIMIT 20
)
SELECT
  jc.jira_key,
  jc.case_number,
  ri.source_id as matching_case,
  fc.theme_key,
  fc.account_id
FROM jira_cases jc
LEFT JOIN raw_inputs ri ON ri.source_id = jc.case_number AND ri.source_type = 'salesforce'
LEFT JOIN friction_cards fc ON fc.raw_input_id = ri.id AND fc.is_friction = true
ORDER BY fc.theme_key IS NOT NULL DESC;
```

## Recommended Fixes

### Fix #1: Add Error Logging to Sync
Edit `/app/api/jira/sync/route.ts` around line 527:

```typescript
// Batch insert theme links
let linksCreated = 0;
if (themeLinksToCreate.length > 0) {
  console.log(`Attempting to create ${themeLinksToCreate.length} theme links...`);

  const { data: createdThemeLinks, error: linkError } = await supabaseAdmin
    .from('theme_jira_links')
    .upsert(themeLinksToCreate, {
      onConflict: 'user_id,jira_issue_id,theme_key',
      ignoreDuplicates: true
    })
    .select();

  if (linkError) {
    console.error('❌ Failed to create theme links:', linkError);
    console.error('Sample link data:', JSON.stringify(themeLinksToCreate[0]));
  } else {
    linksCreated = createdThemeLinks?.length || 0;
    console.log(`✅ Created ${linksCreated} theme links successfully`);
  }
}
```

### Fix #2: Check insertedIssues is populated
After the jira_issues upsert around line 349, add:

```typescript
console.log(`Stored ${insertedIssues?.length || 0} Jira issues (fetched ${allIssues.length}, deduped to ${uniqueJiraIssues.length})`);

// DEBUG: Check if we got issues back
if (!insertedIssues || insertedIssues.length === 0) {
  console.error('⚠️ WARNING: No issues returned from upsert. This will prevent link creation.');
  console.error('This could be due to RLS policy or permissions issue.');
}
```

## Next Steps

1. **Run the constraint check query** to verify the unique key on theme_jira_links
2. **Try the manual insert test** to see if links can be created at all
3. **Run the case ID matching test** to see if direct linking would work
4. **Add error logging** to the sync endpoint (fixes above)
5. **Run sync again** and check server logs for error messages

## Visit Planner Fix

Separate issue - "ofi_score is ambiguous" error.

**Solution**: Run this migration in Supabase SQL Editor:

```sql
-- File: supabase/migrations/20260209_fix_visit_planner_ofi_ambiguous.sql

CREATE OR REPLACE FUNCTION find_nearby_accounts(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_radius_miles DECIMAL,
  p_user_id UUID,
  p_vertical TEXT DEFAULT NULL,
  p_min_arr DECIMAL DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  arr DECIMAL,
  vertical TEXT,
  products TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  distance_miles DECIMAL,
  ofi_score INTEGER,
  owner_name TEXT,
  property_address_city TEXT,
  property_address_state TEXT,
  salesforce_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.arr,
    a.vertical,
    a.products,
    a.latitude,
    a.longitude,
    (
      3959 * acos(
        cos(radians(p_latitude)) *
        cos(radians(a.latitude)) *
        cos(radians(a.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) *
        sin(radians(a.latitude))
      )
    )::DECIMAL as distance_miles,
    COALESCE(s.ofi_score, 0)::INTEGER as ofi_score,
    a.owner_name,
    a.property_address_city,
    a.property_address_state,
    a.salesforce_id
  FROM accounts a
  LEFT JOIN LATERAL (
    SELECT account_snapshots.ofi_score
    FROM account_snapshots
    WHERE account_snapshots.account_id = a.id
    ORDER BY account_snapshots.snapshot_date DESC
    LIMIT 1
  ) s ON true
  WHERE
    a.user_id = p_user_id
    AND a.latitude IS NOT NULL
    AND a.longitude IS NOT NULL
    AND (
      3959 * acos(
        cos(radians(p_latitude)) *
        cos(radians(a.latitude)) *
        cos(radians(a.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) *
        sin(radians(a.latitude))
      )
    ) <= p_radius_miles
    AND (p_vertical IS NULL OR a.vertical = p_vertical)
    AND (a.arr IS NULL OR a.arr >= p_min_arr)
  ORDER BY distance_miles ASC;
END;
$$ LANGUAGE plpgsql STABLE;
```

This explicitly qualifies `account_snapshots.ofi_score` to avoid ambiguity.
