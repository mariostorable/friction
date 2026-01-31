# Incremental Analysis Plan

## Current Problem (Wasteful Approach)

Every time the cron runs daily, for EACH account:

1. **Fetches ALL cases from last 90 days** from Salesforce (up to 2000)
2. **DELETES all old friction_cards and raw_inputs**
3. **Re-analyzes ALL cases** with Claude API (expensive!)

Example:
- Day 1: Analyze Prime Group, 100 cases → creates 100 raw_inputs, 30 friction_cards
- Day 2:
  - ❌ Delete all 100 raw_inputs and 30 friction_cards from Day 1
  - ❌ Fetch all 100 cases again + 2 new cases = 102 total
  - ❌ Send all 102 cases to Claude API ($$$)
  - Creates 102 raw_inputs, 32 friction_cards

**Waste:**
- Salesforce API: Fetched 100 duplicate cases
- Database: Deleted + re-created 100 raw_inputs
- Claude API: Re-analyzed 100 cases ($10-20 wasted)
- Time: 20 minutes instead of 30 seconds

---

## Better Approach (Incremental)

### Step 1: Find Last Analysis Date
```sql
SELECT MAX(metadata->>'created_date') as last_case_date
FROM raw_inputs
WHERE account_id = $1
  AND source_type = 'salesforce_case'
```

If no previous analysis exists, use 90 days ago.

### Step 2: Fetch Only NEW Cases
```sql
-- Instead of: CreatedDate=LAST_N_DAYS:90
-- Use: CreatedDate > [last_case_date]

SELECT Id,CaseNumber,Subject,Description,Status,Priority,CreatedDate,Origin
FROM Case
WHERE AccountId='${account.salesforce_id}'
  AND CreatedDate > ${last_case_date}
ORDER BY CreatedDate DESC
LIMIT 2000
```

### Step 3: Only Analyze NEW Cases
- Keep all old raw_inputs and friction_cards
- Only insert NEW raw_inputs for new cases
- Only analyze NEW cases with Claude API

### Step 4: Recalculate OFI from ALL Cards
- Query ALL friction_cards for this account (old + new)
- Calculate OFI score from all cards within 90-day window
- Create new snapshot with today's date

---

## Benefits

For an account with 100 existing cases + 2 new cases:

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Salesforce API calls | 102 cases | 2 cases | 98% reduction |
| Database deletes | 100 raw_inputs<br>30 friction_cards | 0 | 100% reduction |
| Claude API calls | 102 cases | 2 cases | **~$19.60 saved** |
| Processing time | ~20 minutes | ~30 seconds | 97% faster |

**Daily cost savings for 33 accounts:** ~$650/day = ~$19,500/month

---

## Implementation

### Changes Needed

1. **Remove the delete logic** (lines 288-313 in route.ts)
2. **Add last case date query** before fetching from Salesforce
3. **Update Salesforce query** to use date filter instead of LAST_N_DAYS:90
4. **Query existing friction cards** when calculating OFI
5. **Filter cards to 90-day window** when calculating OFI

### Edge Cases to Handle

1. **First analysis** (no previous raw_inputs)
   - Use 90 days ago as starting point

2. **Cases deleted/modified in Salesforce**
   - Keep our historical data (it's a snapshot in time)
   - Only care about NEW cases going forward

3. **Account needs full re-analysis**
   - Add a "force_full_analysis" flag in accounts table
   - If true, delete old data and run full analysis once
   - Reset flag after completion

4. **Data integrity**
   - Ensure no duplicate raw_inputs (use unique constraint on source_id)
   - Handle Salesforce API pagination for >2000 cases

---

## Rollout Plan

### Phase 1: Add Incremental Logic (New Code Path)
- Keep old logic as fallback
- Add feature flag: `USE_INCREMENTAL_ANALYSIS`
- Test on 1-2 accounts first

### Phase 2: Test and Validate
- Compare OFI scores: incremental vs full analysis
- Verify Claude API cost reduction
- Check for any edge cases

### Phase 3: Full Rollout
- Enable for all accounts
- Remove old "delete everything" logic
- Monitor for issues

---

## Code Structure

```typescript
async function analyzeAccount(accountId: string) {
  // 1. Check if snapshot exists for today → skip
  const existingSnapshot = await getSnapshotForToday(accountId);
  if (existingSnapshot) return { status: 'skipped' };

  // 2. Find last analyzed case date
  const lastCaseDate = await getLastAnalyzedCaseDate(accountId);

  // 3. Fetch only NEW cases from Salesforce
  const newCases = await fetchNewCases(accountId, lastCaseDate);

  if (newCases.length === 0) {
    // No new cases, but recalculate OFI from existing cards
    const existingCards = await getExistingFrictionCards(accountId);
    const ofiScore = calculateOFI(existingCards);
    await createSnapshot(accountId, ofiScore, existingCards);
    return { status: 'no_new_cases', ofi: ofiScore };
  }

  // 4. Analyze only NEW cases
  const newRawInputs = await createRawInputs(newCases);
  const newFrictionCards = await analyzeWithClaude(newRawInputs);

  // 5. Calculate OFI from ALL cards (old + new)
  const allCards = await getAllFrictionCards(accountId);
  const ofiScore = calculateOFI(allCards);

  // 6. Create snapshot
  await createSnapshot(accountId, ofiScore, allCards);

  return {
    status: 'success',
    newCases: newCases.length,
    totalCards: allCards.length,
    ofi: ofiScore
  };
}
```

---

## Quick Win: Implement Today

The biggest cost savings come from **not re-analyzing old cases with Claude API**.

Even if we still fetch all cases from Salesforce (small cost), we can:
1. Check if a raw_input already exists for each case (by source_id)
2. Only analyze cases that don't have a raw_input yet
3. Keep existing friction_cards

This alone would save **~$650/day** in Claude API costs.
