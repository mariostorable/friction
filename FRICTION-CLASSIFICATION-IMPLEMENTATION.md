# Friction vs Normal Support Classification

## Overview
This implementation separates real product **friction** (systemic issues requiring engineering fixes) from **normal support** requests (routine how-to questions, transactional requests).

## Benefits
- **Clearer dashboard**: Only show issues that need product/engineering attention
- **Better Jira integration**: Only create tickets for real friction
- **Accurate OFI scores**: Don't inflate scores with routine support volume
- **Reduced "Other" category**: Better classification with stricter rules

## Implementation Steps

### Step 1: Add Database Column (REQUIRED FIRST)

Run this SQL in Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor):

```sql
-- Add is_friction column to friction_cards table
ALTER TABLE friction_cards
ADD COLUMN IF NOT EXISTS is_friction BOOLEAN DEFAULT true;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_friction_cards_is_friction
ON friction_cards(is_friction);

-- Create combined index for common queries
CREATE INDEX IF NOT EXISTS idx_friction_cards_account_friction
ON friction_cards(account_id, is_friction, created_at DESC);

COMMENT ON COLUMN friction_cards.is_friction IS
'True if this is a systemic product/UX friction issue. False for normal support requests.';
```

### Step 2: Verify Column Was Added

```bash
npx tsx scripts/check-and-add-friction-column.ts
```

Should show: "✅ is_friction column already exists"

### Step 3: Re-classify Existing Cards

```bash
npx tsx scripts/reclassify-friction-cards.ts
```

This will:
- Set `is_friction=true` for all existing cards (they were already filtered)
- Identify "other" theme cards that might be misclassified
- Show you which cards are likely normal support

### Step 4: Test New Analysis

After the column is added, the analyze-friction API will automatically:
- Create cards for ALL cases (both friction and normal support)
- Set `is_friction` flag appropriately
- Use stricter classification rules

###  Step 5: Update Dashboard Queries (I'll do this for you)

The following will be updated to filter `is_friction=true`:
- Dashboard friction card counts
- OFI score calculations
- Issue Resolution Progress component
- Jira ticket linking (only create for friction)

## Classification Rules

### Friction (is_friction=true)
- Bugs, errors, system failures
- Features broken or not working as expected
- Confusing UI/UX blocking workflows
- Performance problems
- Integration failures, API errors
- Missing critical functionality
- System-caused data quality issues
- Billing/payment processing errors

### Normal Support (is_friction=false)
- Auto-replies, out-of-office messages
- "Change my email", "Update address", "Reset password"
- "Add new location", "Setup new user"
- Simple how-to questions
- Feature requests without demonstrated pain
- Positive feedback, thank-you messages
- Account cancellations, service changes

## Files Modified

- ✅ `types/index.ts` - Added `is_friction` field to FrictionCard
- ✅ `app/api/analyze-friction/route.ts` - Updated prompt and logic
- ✅ `scripts/add-normal-support-theme.ts` - Added "normal_support" theme
- ⏳ Dashboard queries (next step)
- ⏳ Jira linking logic (next step)

## Next: After You Run the SQL

Once you've run the SQL migration in Supabase, let me know and I'll:
1. Update all dashboard queries to filter by `is_friction=true`
2. Update Jira linking to only create tickets for friction
3. Update Issue Resolution Progress to count only friction
4. Test the full flow end-to-end

## Questions?

This is a significant change, but it will make the product much more useful by focusing on actionable friction rather than routine support volume.
