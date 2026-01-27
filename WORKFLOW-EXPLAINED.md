# Friction Intelligence Platform - Complete Workflow

## Overview
This document explains what each action does and how the automated system works.

---

## 1. Automated Job (Runs Every Hour)

**Location:** Supabase cron job → `/api/cron/analyze-portfolio`

**What it does:**
1. Loops through all accounts in Top 25 EDGE and Top 25 SiteLink portfolios
2. For each account that hasn't been analyzed today:
   - Fetches cases from Salesforce (last 90 days, up to 100 cases)
   - **DELETES all old friction cards and raw inputs** for that account
   - Stores new raw inputs from Salesforce
   - Analyzes each case with Claude AI
   - Creates friction cards with severity, theme, sentiment
   - Calculates OFI score using **IMPROVED ALGORITHM**
   - Creates snapshot for the day
3. Processes up to **3 accounts per run** to avoid timeout
4. Skips accounts already analyzed today

**Status:** ✅ **FIXED** - Now uses the improved OFI calculation formula

---

## 2. "Sync & Analyze All" Button (Dashboard)

**Location:** Dashboard page → `/api/salesforce/sync`

**What it does:**
1. Syncs account metadata from Salesforce (ARR, name, vertical, etc.)
2. Creates/updates Top 25 EDGE portfolio
3. Creates/updates Top 25 SiteLink portfolio
4. Triggers the automated job in the background (fire-and-forget)
5. Shows progress as accounts are analyzed

**When to use:**
- After adding new accounts to Salesforce
- When you want to refresh portfolio membership
- First time setup

---

## 3. "Analyze Friction" Button (Account Page)

**Location:** Individual account detail page

**What it does:**
1. **Syncs cases** - Fetches latest cases from Salesforce for THIS account only
2. **Analyzes friction** - Runs Claude AI on unprocessed cases
3. **Calculates OFI** - Uses improved algorithm with normalization
4. Refreshes the page to show results

**When to use:**
- When you need immediate results for a specific account
- When an account has new cases but automated job hasn't run yet
- When you want to manually refresh data for one account

---

## OFI Score Calculation (Improved Algorithm)

Both the automated job and manual "Analyze Friction" button now use the **same improved algorithm**:

### Formula Components:

1. **Weighted Severity Score**
   - Severity 1 = 1 point
   - Severity 2 = 2 points
   - Severity 3 = 4 points
   - Severity 4 = 8 points
   - Severity 5 = 16 points

2. **Base Score** (Logarithmic)
   - `baseScore = Math.log10(weightedScore + 1) * 20`
   - Prevents easy cap-out at 100
   - Example: 100 weighted points → 46 base score

3. **Friction Density Multiplier** (0.5x to 2x)
   - Calculates what % of cases have friction
   - `frictionDensity = (frictionCards / totalCases) * 100`
   - If 5% of cases have friction = normal (1x multiplier)
   - If 1% = healthy (0.5x), if 10%+ = concerning (1.5-2x)

4. **High Severity Boost**
   - Each severity 4-5 issue adds +2 points
   - Capped at +20 points max

5. **Final Score**
   - `OFI = baseScore * densityMultiplier + highSeverityBoost`
   - Capped at 100, minimum 0

### Score Ranges:
- **0-39** = Healthy (low friction)
- **40-69** = Moderate (needs attention)
- **70-100** = Critical (at-risk, requires immediate action)

---

## Key Differences: Automated vs Manual

| Feature | Automated Job | "Analyze Friction" Button |
|---------|---------------|---------------------------|
| Trigger | Every hour (cron) | Manual click |
| Scope | Top 25 portfolios | Single account |
| Accounts per run | Up to 3 | Just 1 |
| Data cleanup | Deletes old data | Keeps old data, adds new |
| OFI Formula | ✅ Improved (as of today) | ✅ Improved |
| Best for | Overnight updates | Immediate results |

---

## Recommended Workflow

### Daily Use:
1. Check dashboard in the morning - automated job ran overnight
2. Review accounts with OFI 70+ (critical)
3. Click into specific accounts for details
4. Use "Analyze Friction" button if you need fresh data immediately

### Weekly/Monthly:
1. Click "Sync & Analyze All" to refresh account metadata
2. Review portfolio composition (Top 25 may change based on ARR)
3. Generate briefings for upcoming customer meetings

### Before Customer Meetings:
1. Open account detail page
2. Click "Analyze Friction" to get latest data
3. Click "Generate Briefing" (Quick or Deep)
4. Export to PDF for meeting prep

---

## What Data Gets Deleted?

**Automated job deletes:**
- All friction cards for the account being analyzed
- All raw inputs for the account
- Then re-creates fresh data from Salesforce (last 90 days)

**Why?** Ensures you're always working with the most recent 90-day window, not accumulating stale data.

**What's preserved:**
- Account snapshots (historical OFI scores)
- Account metadata (ARR, name, etc.)
- Portfolio membership

---

## Troubleshooting

### "Everything shows OFI 100"
- ✅ **FIXED** - Updated to improved algorithm
- Old formula hit ceiling too easily
- New formula uses logarithmic scaling and normalization

### "Automated job not running"
- Check Supabase cron job status: `SELECT * FROM cron.job;`
- Verify `ANTHROPIC_API_KEY` is set in environment
- Check Vercel logs for errors

### "Account not updating"
- Manual fix: Click "Analyze Friction" on account page
- Check if account is in Top 25 portfolio
- Verify Salesforce connection is active

### "No friction cards showing"
- Ensure cases exist in Salesforce (last 90 days)
- Check that cases are linked to correct AccountId
- Run "Analyze Friction" manually to see error messages

---

## Account Deletion Scripts

Created deletion scripts in `/scripts/`:
- `delete-simply-self-storage.sql` - Removes Simply Self Storage - CORP
- `delete-account-605928e1.sql` - Removes account by UUID

To execute:
1. Open Supabase → SQL Editor
2. Copy/paste script contents
3. Review the verification query before committing
4. Run the script

---

## Next Steps

1. ✅ Improved OFI algorithm deployed
2. ✅ Automated job updated with new formula
3. Run deletion scripts for cancelled accounts
4. Monitor OFI scores over next 24 hours to see better distribution
5. Expected results: Scores will range from 20-80 instead of all being 100
