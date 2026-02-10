# Jira Sync Fix - Add Error Logging

## Problem
The Jira sync doesn't log errors when theme link creation fails, making it impossible to debug why 0 links are created despite keyword matches finding 63 potential matches.

## Solution
Add error logging and validation to the link creation process.

## Apply This Patch

Edit `/app/api/jira/sync/route.ts` and make these changes:

### Change 1: Add error logging after jira_issues upsert (around line 349)

**Find this:**
```typescript
console.log(`Stored ${insertedIssues?.length || 0} Jira issues (fetched ${allIssues.length}, deduped to ${uniqueJiraIssues.length})`);

// EXPANDED STRATEGY: Match against ALL Salesforce cases, not just friction=true
```

**Replace with:**
```typescript
console.log(`Stored ${insertedIssues?.length || 0} Jira issues (fetched ${allIssues.length}, deduped to ${uniqueJiraIssues.length})`);

// DEBUG: Validate insertedIssues
if (!insertedIssues || insertedIssues.length === 0) {
  console.error('⚠️  WARNING: No issues returned from upsert!');
  console.error('This means link creation will be skipped.');
  console.error('Possible causes: RLS policy, permissions, or all issues were duplicates with ignoreDuplicates=true');
  console.error('Attempted to insert:', uniqueJiraIssues.length, 'issues');
} else {
  console.log(`✅ Got ${insertedIssues.length} issues back from DB for link processing`);
  // Sample first issue to verify structure
  if (insertedIssues[0]) {
    console.log('Sample issue structure:', {
      id: insertedIssues[0].id,
      jira_key: insertedIssues[0].jira_key,
      has_summary: !!insertedIssues[0].summary,
      has_description: !!insertedIssues[0].description,
      has_labels: !!insertedIssues[0].labels,
      labels_length: insertedIssues[0].labels?.length
    });
  }
}

// EXPANDED STRATEGY: Match against ALL Salesforce cases, not just friction=true
```

### Change 2: Add error logging for theme link creation (around line 524)

**Find this:**
```typescript
console.log(`Link strategies: ${directLinksCount} direct (via Case ID), ${keywordLinksCount} keyword-based`);

// Batch insert theme links
let linksCreated = 0;
if (themeLinksToCreate.length > 0) {
  const { data: createdThemeLinks } = await supabaseAdmin
    .from('theme_jira_links')
    .upsert(themeLinksToCreate, { onConflict: 'user_id,jira_issue_id,theme_key', ignoreDuplicates: true })
    .select();
  linksCreated = createdThemeLinks?.length || themeLinksToCreate.length;
}
```

**Replace with:**
```typescript
console.log(`Link strategies: ${directLinksCount} direct (via Case ID), ${keywordLinksCount} keyword-based`);
console.log(`Preparing to create ${themeLinksToCreate.length} theme links...`);

// DEBUG: Show sample links being created
if (themeLinksToCreate.length > 0) {
  console.log('Sample theme link (first 3):', JSON.stringify(themeLinksToCreate.slice(0, 3), null, 2));
}

// Batch insert theme links
let linksCreated = 0;
if (themeLinksToCreate.length > 0) {
  console.log(`Attempting upsert of ${themeLinksToCreate.length} theme links...`);

  const { data: createdThemeLinks, error: linkError } = await supabaseAdmin
    .from('theme_jira_links')
    .upsert(themeLinksToCreate, {
      onConflict: 'user_id,jira_issue_id,theme_key',
      ignoreDuplicates: true
    })
    .select();

  if (linkError) {
    console.error('❌ FAILED to create theme links!');
    console.error('Error:', linkError);
    console.error('Error details:', JSON.stringify(linkError, null, 2));
    console.error('Sample link data:', JSON.stringify(themeLinksToCreate[0], null, 2));
    console.error('Total links attempted:', themeLinksToCreate.length);

    // Check if it's a constraint error
    if (linkError.message?.includes('constraint') || linkError.code === '23505') {
      console.error('💡 This is a constraint violation. The conflict key might be wrong.');
      console.error('💡 Run this query to check constraints:');
      console.error('   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = \'theme_jira_links\'::regclass;');
    }
  } else {
    linksCreated = createdThemeLinks?.length || 0;
    console.log(`✅ Successfully created ${linksCreated} theme links`);

    if (linksCreated === 0 && themeLinksToCreate.length > 0) {
      console.warn('⚠️  WARNING: Upsert succeeded but returned 0 links!');
      console.warn('This could mean all links already existed (ignoreDuplicates=true)');
    }
  }
} else {
  console.log('⚠️  No theme links to create (themeLinksToCreate is empty)');
  console.log('Debug info:');
  console.log('  - actualThemes count:', actualThemes.length);
  console.log('  - insertedIssues count:', insertedIssues?.length || 0);
  console.log('  - directLinksCount:', directLinksCount);
  console.log('  - keywordLinksCount:', keywordLinksCount);
}
```

### Change 3: Add logging for account link creation (around line 568)

**Find this:**
```typescript
// Batch insert account links (includes both direct Case ID links AND theme-based links)
let accountLinksCreated = 0;
if (accountLinksToCreate.length > 0) {
  const { data: createdAccountLinks, error: accountLinksError } = await supabaseAdmin
    .from('account_jira_links')
    .upsert(accountLinksToCreate, { onConflict: 'account_id,jira_issue_id', ignoreDuplicates: true })
    .select();

  if (accountLinksError) {
    console.error('Failed to create account links:', accountLinksError);
  }

  accountLinksCreated = createdAccountLinks?.length || 0;
}
```

**Replace with:**
```typescript
// Batch insert account links (includes both direct Case ID links AND theme-based links)
let accountLinksCreated = 0;
if (accountLinksToCreate.length > 0) {
  console.log(`Attempting to create ${accountLinksToCreate.length} account links...`);

  const { data: createdAccountLinks, error: accountLinksError } = await supabaseAdmin
    .from('account_jira_links')
    .upsert(accountLinksToCreate, { onConflict: 'account_id,jira_issue_id', ignoreDuplicates: true })
    .select();

  if (accountLinksError) {
    console.error('❌ Failed to create account links:', accountLinksError);
    console.error('Error details:', JSON.stringify(accountLinksError, null, 2));
  } else {
    accountLinksCreated = createdAccountLinks?.length || 0;
    console.log(`✅ Created ${accountLinksCreated} account links`);
  }
}
```

## After Applying the Patch

1. **Restart your Next.js dev server** (if running locally)
2. **Trigger a new Jira sync** from the dashboard
3. **Check the server logs** (terminal where Next.js is running, or Vercel logs)
4. **Look for these log messages:**
   - `⚠️ WARNING: No issues returned from upsert!` → Means insertedIssues is empty
   - `❌ FAILED to create theme links!` → Means database error occurred
   - `⚠️ No theme links to create` → Means keyword matching found 0 matches
   - `✅ Successfully created X theme links` → Success!

## What This Will Tell Us

The enhanced logging will reveal:
- Whether `insertedIssues` is null/empty (preventing link creation)
- The exact database error message (if any)
- Whether the conflict key is correct
- Whether keyword matching is actually generating links
- Sample link data structure to verify format

## Quick Test Query

Run this in Supabase SQL Editor to verify the table constraint:

```sql
-- Check theme_jira_links constraints
SELECT
  conname as constraint_name,
  contype as type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'theme_jira_links'::regclass;
```

Expected output should show a UNIQUE constraint on `(user_id, jira_issue_id, theme_key)`.

If the constraint is different (e.g., just `(jira_issue_id, theme_key)`), update the sync code's `onConflict` parameter to match.
