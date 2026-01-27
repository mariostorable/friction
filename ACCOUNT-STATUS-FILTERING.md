# Account Status Filtering

## Overview
Instead of deleting cancelled accounts, the system now uses a `status` field to filter them out while preserving all historical data.

---

## How It Works

### Status Values
Accounts can have one of four statuses:
- **`active`** - Current customer (default for all accounts)
- **`cancelled`** - Contract cancelled, no longer a customer
- **`churned`** - Customer left/churned
- **`prospect`** - Potential customer (not yet signed)

### What Gets Filtered

**Cancelled and churned accounts are automatically hidden from:**
1. ✅ Dashboard portfolio view
2. ✅ Top 25 EDGE/SiteLink portfolios
3. ✅ Automated analysis job (won't waste API calls)
4. ✅ "Sync & Analyze All" button

**Historical data is preserved:**
- ❌ Friction cards are NOT deleted
- ❌ Raw inputs (cases) are NOT deleted
- ❌ Account snapshots are NOT deleted
- ❌ Account metadata is NOT deleted

---

## How to Mark an Account as Cancelled

### Step 1: Run the SQL Script

**File:** `/Users/mario/friction-intelligence/scripts/add-account-status-field.sql`

This script will:
1. Add the `status` column to the accounts table (if not exists)
2. Create an index for performance
3. Mark Simply Self Storage - CORP as cancelled
4. Show all cancelled accounts

### Step 2: Mark Additional Accounts (If Needed)

**File:** `/Users/mario/friction-intelligence/scripts/mark-account-cancelled.sql`

To mark Simply Self Storage - CORP as cancelled:

```sql
UPDATE accounts
SET status = 'cancelled'
WHERE name ILIKE '%Simply Self Storage - CORP%';
```

Or by ID:
```sql
UPDATE accounts
SET status = 'cancelled'
WHERE id = '605928e1-ab61-4962-8b8f-a2b8c570cd86';
```

### Step 3: Verify
```sql
-- View all cancelled accounts
SELECT id, name, arr, status, customer_since
FROM accounts
WHERE status = 'cancelled'
ORDER BY arr DESC;
```

---

## What Happens After Marking as Cancelled

### Immediately:
- Account disappears from dashboard
- Won't appear in Top 25 portfolios on next sync
- Won't be analyzed by automated job

### On Next "Sync & Analyze All":
- Portfolio membership is recalculated
- Next account in line (by ARR) takes their spot

### Historical Data:
- All past friction cards remain in database
- All OFI score snapshots remain
- Can still access account detail page directly via URL
- Can run reports on historical performance

---

## How to Reactivate a Cancelled Account

If an account comes back:

```sql
UPDATE accounts
SET status = 'active'
WHERE id = 'account-id-here';
```

Then run "Sync & Analyze All" to add them back to portfolios.

---

## Code Changes Made

### 1. Database Schema
Added `status` column to accounts table with default `'active'`

### 2. Dashboard Query (dashboard/page.tsx)
```typescript
.eq('status', 'active')
```

### 3. Salesforce Sync (api/salesforce/sync/route.ts)
```typescript
.eq('status', 'active')  // Only include active accounts in portfolios
```

### 4. Automated Job (api/cron/analyze-portfolio/route.ts)
```typescript
// Skip cancelled accounts
if (account.status === 'cancelled' || account.status === 'churned') {
  console.log(`Skipping ${account.name} - account is ${account.status}`);
  continue;
}
```

### 5. TypeScript Types (types/index.ts)
```typescript
status: 'active' | 'cancelled' | 'churned' | 'prospect';
```

---

## Benefits of This Approach

### vs Deleting Accounts:
✅ **Preserve history** - Can review past friction patterns for churned customers
✅ **Accurate reporting** - Historical ARR and metrics remain intact
✅ **Reversible** - Easy to reactivate if customer returns
✅ **Audit trail** - Can see when accounts were marked cancelled

### Performance:
✅ **No wasted API calls** - Won't analyze cancelled accounts
✅ **Cleaner dashboard** - Only see current customers
✅ **Faster queries** - Indexed status field for quick filtering

---

## FAQ

**Q: Will cancelled accounts still count toward my API usage?**
A: No, the automated job skips cancelled accounts entirely.

**Q: Can I still access a cancelled account's detail page?**
A: Yes, if you have the direct URL. It just won't appear in dashboard/portfolios.

**Q: What happens to Simply Self Storage's $1.1M ARR?**
A: It won't count in portfolio totals anymore, so your average ARR will adjust accordingly.

**Q: How do I see all cancelled accounts?**
A: Run: `SELECT * FROM accounts WHERE status = 'cancelled' ORDER BY arr DESC;`

**Q: What if I want to permanently delete an account?**
A: Use the deletion scripts in `/scripts/` folder, but this is **not recommended** as you lose all history.

---

## Migration Instructions

Run these in order:

1. **Add status field:**
   ```sql
   -- Run scripts/add-account-status-field.sql
   ```

2. **Mark Simply Self Storage as cancelled:**
   ```sql
   -- Run scripts/mark-account-cancelled.sql
   ```

3. **Verify:**
   - Check dashboard - Simply Self Storage should be gone
   - Check database - status should be 'cancelled'
   - Historical data should still exist

4. **Deploy code changes:**
   - All code changes are already in place
   - Just need to run the SQL scripts

---

## Example: Marking Multiple Accounts

```sql
-- Mark multiple accounts at once
UPDATE accounts
SET status = 'cancelled'
WHERE name IN (
  'Simply Self Storage - CORP',
  'Another Cancelled Account - LLC'
);

-- Or by ARR threshold
UPDATE accounts
SET status = 'cancelled'
WHERE arr < 10000 AND customer_since < '2020-01-01';

-- Always verify before committing
SELECT id, name, arr, status FROM accounts WHERE status = 'cancelled';
```

---

## Monitoring

Add this query to your monitoring dashboard:

```sql
-- Account status breakdown
SELECT
  status,
  COUNT(*) as account_count,
  SUM(arr) as total_arr,
  ROUND(AVG(arr), 0) as avg_arr
FROM accounts
GROUP BY status
ORDER BY total_arr DESC;
```

Expected output:
```
status     | account_count | total_arr | avg_arr
-----------|---------------|-----------|----------
active     | 48            | 15000000  | 312500
cancelled  | 1             | 1097216   | 1097216
churned    | 0             | 0         | 0
prospect   | 0             | 0         | 0
```
