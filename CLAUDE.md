# Friction Intelligence Platform - Developer Guide

**Last Updated**: February 11, 2026
**Version**: 1.0
**Stack**: Next.js 14 + Supabase + Claude AI

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Patterns](#api-patterns)
5. [Current State](#current-state)
6. [Development Conventions](#development-conventions)
7. [Key Gotchas](#key-gotchas)
8. [Quick Start](#quick-start)

---

## Project Overview

### What This App Does

**Friction Intelligence** is an AI-powered early-warning system that identifies and tracks customer friction signals from unstructured data. It helps Customer Success teams:

1. **Detect friction patterns** from Salesforce cases, Jira tickets, and Vitally notes
2. **Explain the "why"** with Claude AI analysis (not just flags, but root causes)
3. **Prioritize visits** geographically with friction × revenue × proximity scoring
4. **Track trends** with daily OFI (Operational Friction Index) snapshots
5. **Generate briefings** for customer meetings with AI-powered summaries

### Core Value Proposition

> **Explainable, actionable insights from customer friction data**

Every friction signal includes:
- Plain English summary
- Evidence snippets from source data
- Root cause hypothesis
- Confidence score (0-100%)
- Detailed reasoning explaining Claude's analysis

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript 5, Tailwind CSS |
| **Backend** | Next.js API Routes (92 endpoints), Vercel serverless |
| **Database** | Supabase PostgreSQL 14+ with Row-Level Security |
| **AI Analysis** | Claude (Anthropic) via API |
| **Integrations** | Salesforce (OAuth), Jira (REST API), Vitally, Google Maps |
| **Authentication** | Supabase Auth + Google SSO |
| **Deployment** | Vercel (Hobby/Pro), Supabase cloud |

---

## Architecture

### Directory Structure

```
/app                           # Next.js 14 App Router
├── /api                       # 92 backend API routes
│   ├── /auth                  # Salesforce/OAuth flows
│   ├── /cron                  # Scheduled jobs (sync, analysis)
│   ├── /salesforce            # Salesforce integration
│   ├── /jira                  # Jira integration
│   ├── /vitally               # Vitally integration
│   ├── /briefing              # AI briefing generation
│   ├── /visit-planner         # Geographic visit planning
│   └── /debug                 # 40+ diagnostic endpoints
├── /dashboard                 # Main dashboard page
├── /account/[id]              # Account detail pages
├── /visit-planner             # Geographic account planner
├── /settings                  # Settings & integrations
└── layout.tsx                 # Root layout

/components                    # 43 React components
├── AccountCard.tsx            # Account summary card
├── PortfolioSummary.tsx       # Portfolio overview
├── FrictionClusters.tsx       # Friction visualization
├── VisitBriefing.tsx          # AI-generated briefings
├── JiraConnector.tsx          # Jira integration UI
└── ...                        # 38 more components

/lib                           # Utilities
├── supabase.ts                # Supabase client setup
├── encryption.ts              # OAuth token encryption (pgcrypto)
├── priorityScore.ts           # Visit Planner scoring
├── themeAggregation.ts        # Theme aggregation logic
└── utils.ts                   # Helper functions

/types                         # TypeScript definitions
└── index.ts                   # All database & API types

/supabase                      # Supabase config
├── /migrations                # 12 SQL migrations (dated)
└── /functions                 # Edge Functions (planned)

/scripts                       # Database utilities & diagnostics
├── *.sql                      # Debug queries, schema checks
└── *.ts                       # Database utility scripts
```

### Key Entry Points

| Purpose | Path |
|---------|------|
| **Main Dashboard** | `/app/dashboard/page.tsx` |
| **Account Detail** | `/app/account/[id]/page.tsx` |
| **Visit Planner** | `/app/visit-planner/page.tsx` |
| **OAuth Flow** | `/app/api/auth/salesforce/route.ts` |
| **Salesforce Sync** | `/app/api/cron/sync-salesforce/route.ts` |
| **Jira Sync** | `/app/api/jira/sync/route.ts` |
| **Friction Analysis** | `/app/api/analyze-friction/route.ts` |
| **Portfolio Analysis** | `/app/api/cron/analyze-portfolio/route.ts` |
| **Briefing Generator** | `/app/api/briefing/generate/route.ts` |

---

## Database Schema

### Core Tables

#### `accounts`
Customer accounts synced from Salesforce
```sql
id (uuid)
user_id (uuid) -- FK to profiles
salesforce_id (text) -- Salesforce Account ID
name (text)
arr (numeric) -- Annual Recurring Revenue
vertical (text) -- 'storage', 'marine', 'rv'
products (text) -- Comma-separated product names
status (text) -- 'active', 'churned', 'inactive'
segment (text) -- 'enterprise', 'mid-market', 'smb'
latitude, longitude (numeric) -- For Visit Planner
address, city, state, zip, country (text)
created_at, last_synced_at (timestamp)
```

#### `raw_inputs`
Unprocessed source data before AI analysis
```sql
id (uuid)
user_id (uuid)
account_id (uuid) -- FK to accounts
source_type (text) -- 'salesforce_case', 'jira', 'vitally', 'manual'
source_id (text) -- External ID (Salesforce Case #, Jira key)
text_content (text) -- Case subject + description combined
created_date (timestamp) -- When case was created in source system
processed (boolean) -- False until AI analyzes it
```

#### `friction_cards`
AI-analyzed friction signals
```sql
id (uuid)
user_id (uuid)
account_id (uuid)
summary (text) -- Plain English explanation
theme_key (text) -- FK to themes (e.g., 'billing_confusion')
severity (integer) -- 1-5 scale
evidence_snippets (text[]) -- Direct quotes from source
root_cause_hypothesis (text) -- What might be causing this
confidence_score (numeric) -- 0-100% confidence
reasoning (text) -- Claude's explanation of analysis
is_friction (boolean) -- True if friction, false if normal support
created_at (timestamp)
```

#### `themes`
Friction categories
```sql
theme_key (text) PRIMARY KEY -- 'billing_confusion', 'integration_failures'
label (text) -- Human-readable name
description (text)
category (text) -- 'product', 'process', 'training', 'integration'
severity_weight (numeric) -- Multiplier for OFI calculation
```

#### `account_snapshots`
Daily OFI score snapshots
```sql
id (uuid)
account_id (uuid)
snapshot_date (date)
ofi_score (numeric) -- 0-100 Operational Friction Index
friction_card_count (integer)
high_severity_count (integer) -- Cards with severity >= 4
top_themes (jsonb) -- [{ theme_key, count, avg_severity }]
score_breakdown (jsonb) -- { severity_points, recency_factor, density_multiplier }
trend_direction (text) -- 'increasing', 'stable', 'decreasing'
trend_vs_prior_period (numeric) -- Percentage change
```

#### `portfolios`
Collections of accounts
```sql
id (uuid)
user_id (uuid)
portfolio_type (text) -- 'top_25_edge', 'top_25_sitelink', 'random_sample'
account_ids (uuid[]) -- Array of account IDs
refresh_frequency (text) -- 'daily', 'weekly'
created_at, updated_at (timestamp)
```

#### `integrations`
OAuth connections to external services
```sql
id (uuid)
user_id (uuid)
integration_type (text) -- 'salesforce', 'jira', 'vitally'
status (text) -- 'active', 'error', 'disconnected'
instance_url (text) -- e.g., https://storable.my.salesforce.com
last_synced_at (timestamp)
error_message (text)
metadata (jsonb) -- Integration-specific data (email, project keys, etc.)
```

#### `oauth_tokens`
Encrypted OAuth tokens
```sql
id (uuid)
integration_id (uuid) -- FK to integrations
access_token_encrypted (bytea) -- pgcrypto encrypted
refresh_token_encrypted (bytea)
token_type (text) -- 'Bearer'
expires_at (timestamp)
```

#### `jira_issues`
Synced Jira tickets
```sql
id (uuid)
user_id (uuid)
integration_id (uuid)
jira_id (text) -- Jira's internal ID
jira_key (text) -- e.g., 'EDGE-4200'
summary (text)
description (text)
status (text) -- 'Open', 'In Progress', 'Done'
issue_type (text) -- 'Bug', 'Story', 'Epic'
priority (text) -- 'High', 'Medium', 'Low'
components (text[]) -- Product components
fix_versions (text[]) -- Target releases
metadata (jsonb) -- { custom_fields: { customfield_12184: "Client names", ... } }
created_date, updated_date (timestamp)
```

#### `account_jira_links`
Links Jira tickets to accounts
```sql
user_id (uuid)
account_id (uuid)
jira_issue_id (uuid)
match_type (text) -- 'client_field', 'salesforce_case', 'account_name', 'theme_association'
match_confidence (numeric) -- 0.0-1.0 confidence score
```

#### `theme_jira_links`
Links Jira tickets to friction themes
```sql
user_id (uuid)
jira_issue_id (uuid)
theme_key (text)
match_type (text) -- 'keyword', 'label', 'component'
match_confidence (numeric) -- 0.0-1.0
```

### Key Relationships

```
profiles (user)
    ├── accounts (many)
    │   ├── raw_inputs (many)
    │   ├── friction_cards (many)
    │   └── account_snapshots (many)
    ├── portfolios (many)
    │   └── account_ids[] → accounts
    ├── integrations (many)
    │   └── oauth_tokens (one)
    └── jira_issues (many)
        ├── account_jira_links → accounts
        └── theme_jira_links → themes
```

### Row-Level Security (RLS)

All user-owned tables have RLS policies:
- Users can only see their own data
- Enforced at database level (not application)
- Service role key bypasses RLS for cron jobs

---

## API Patterns

### Authentication Flow

1. **User Login**: Google SSO via Supabase Auth
2. **Session**: Stored in cookies by `@supabase/auth-helpers-nextjs`
3. **Protected Routes**: Check `supabase.auth.getUser()` in API routes
4. **Integration OAuth**: Separate OAuth flows for Salesforce/Jira

### API Route Structure

```typescript
// Standard API route pattern
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  // Authenticate
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Query data (RLS automatically filters by user)
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('status', 'active');

  return NextResponse.json({ data });
}
```

### Cron Job Pattern

Cron jobs use secret-based auth (not session cookies):

```typescript
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const userIdHeader = request.headers.get('x-user-id');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use admin client (bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Process sync...
}
```

### Data Sync Workflow

1. **Scheduled Trigger**: Vercel Cron or manual button
2. **Sync Endpoint**: `/api/cron/sync-salesforce` (or jira/vitally)
3. **Incremental Fetch**: Check `last_synced_at`, only fetch new data
4. **Store Raw Data**: Insert into `raw_inputs` with `processed=false`
5. **Update Timestamp**: Set `integrations.last_synced_at`
6. **Return Status**: `{ success: true, synced: 42 }`

### AI Analysis Workflow

1. **Trigger**: Manual or scheduled `/api/cron/analyze-portfolio`
2. **Fetch Unprocessed**: Get `raw_inputs` where `processed=false`
3. **Call Claude**: Send batch of cases to Claude with friction analysis prompt
4. **Parse Response**: Extract summary, theme, severity, evidence, reasoning
5. **Store Friction Cards**: Insert into `friction_cards` if `is_friction=true`
6. **Mark Processed**: Update `raw_inputs.processed=true`
7. **Calculate OFI**: Aggregate friction cards into `account_snapshots`

### Claude AI Prompt Pattern

```typescript
const prompt = `Analyze this customer support case for operational friction signals.

CASE:
Subject: ${caseSubject}
Description: ${caseDescription}
Account: ${accountName}
Date: ${createdDate}

TASK:
1. Is this FRICTION (systemic issue) or NORMAL SUPPORT (one-off)?
2. If friction, provide:
   - Summary: Plain English explanation
   - Theme: Select from [billing_confusion, integration_failures, ui_confusion, ...]
   - Severity: 1-5 scale
   - Root cause hypothesis
   - Evidence snippets (direct quotes)
   - Confidence score (0-100%)
   - Reasoning: Explain your analysis

Output JSON:
{
  "is_friction": boolean,
  "summary": "...",
  "theme_key": "...",
  "severity": 1-5,
  "root_cause_hypothesis": "...",
  "evidence_snippets": ["...", "..."],
  "confidence_score": 85,
  "reasoning": "..."
}`;

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1500,
  messages: [{ role: 'user', content: prompt }]
});
```

### Error Handling Pattern

```typescript
try {
  // API operation
  const result = await riskyOperation();
  return NextResponse.json({ success: true, data: result });
} catch (error) {
  console.error('Operation failed:', error);
  return NextResponse.json({
    error: 'Operation failed',
    details: error instanceof Error ? error.message : 'Unknown error'
  }, { status: 500 });
}
```

---

## Current State

### ✅ Working Features (Feb 11, 2026)

1. **Dashboard**
   - ✅ Portfolio summary showing Top 25 accounts
   - ✅ Account cards with OFI scores
   - ✅ Sorting/filtering (ARR, OFI, name)
   - ✅ Portfolio tabs (Portfolios, Favorites, Reports, Themes)
   - ✅ Theme aggregation across accounts

2. **Salesforce Integration**
   - ✅ OAuth connection flow
   - ✅ Account sync (200 accounts synced)
   - ✅ Case sync (incremental)
   - ✅ Token encryption (pgcrypto)
   - ✅ Token refresh flow
   - ✅ Custom field discovery

3. **Jira Integration**
   - ✅ Basic auth connection
   - ✅ Issue sync (1000 most recent)
   - ✅ Custom field extraction (including Client field: customfield_12184)
   - ✅ **Client field linking** (NEW: Feb 11) - Links tickets via client names
   - ✅ Account linking (4 strategies: client_field, salesforce_case, account_name, theme_association)
   - ✅ Theme keyword matching
   - ✅ Roadmap view by theme
   - ✅ Account-specific roadmap

4. **AI Analysis**
   - ✅ Friction detection with Claude
   - ✅ Explainable AI (summary, evidence, reasoning)
   - ✅ Theme classification
   - ✅ Severity scoring (1-5)
   - ✅ Confidence scores

5. **Account Detail Page**
   - ✅ Friction card list
   - ✅ OFI score history chart
   - ✅ Case volume metrics
   - ✅ Jira roadmap tab
   - ✅ AI briefing generation

6. **Visit Planner**
   - ✅ Geographic map view
   - ✅ Nearby account search
   - ✅ Priority scoring (revenue × friction × proximity)
   - ✅ Google Maps integration
   - ✅ Address geocoding

### 🚧 In Progress

1. **Jira Client Field Linking** (COMPLETED TODAY)
   - ✅ Identified customfield_12184 as Client(s) field
   - ✅ Implemented extraction and parsing
   - ✅ Added high-confidence account matching (0.95)
   - ⏳ **Next**: Run Jira sync to create links for 11 West Coast tickets + 5 White Label tickets

2. **Dashboard Display Issues** (FIXED TODAY)
   - ✅ Fixed column mismatch errors (removed non-existent fields)
   - ✅ Dashboard now showing 52 active accounts correctly
   - ✅ Fixed RLS warnings for themes table

3. **Friction Theme Filtering** (FIXED TODAY)
   - ✅ Added `is_friction=true` filter to analyze-portfolio cron
   - ✅ "Normal Support" and "Other" no longer appearing in themes

### ❌ Known Issues

1. **EDGE-4200 Missing**
   - Ticket from user's PDF not in database
   - Likely older than 90-day sync window
   - Sync only fetches recent tickets (last 90 days)

2. **StorageMart Not Matching**
   - "StorageMart" in Client field doesn't match any account
   - Likely not in Top 25 portfolios or inactive

### 🔜 Planned Features

1. **Zendesk Integration** (not started)
2. **Gong Call Transcripts** (not started)
3. **Slack Notifications** (not started)
4. **Email Briefing Export** (partially implemented)
5. **Multi-User Support** (foundation exists, needs UI)

---

## Development Conventions

### TypeScript Patterns

1. **Strict Typing**: `tsconfig.json` has `strict: true`
2. **No `any`**: Avoid `any` types in core logic
3. **Interfaces**: All database tables have interfaces in `/types/index.ts`
4. **Type Imports**: Use `import type` for type-only imports

```typescript
// Good
import type { Account, FrictionCard } from '@/types';

// Bad
import { Account } from '@/types'; // if only used as type
```

### Component Conventions

1. **File Naming**: PascalCase for components (`AccountCard.tsx`)
2. **Default Exports**: Use default exports for pages/components
3. **Props Interface**: Define props interface above component

```typescript
interface AccountCardProps {
  account: Account;
  onSelect: (id: string) => void;
}

export default function AccountCard({ account, onSelect }: AccountCardProps) {
  // Component code
}
```

### API Route Conventions

1. **File Naming**: `route.ts` for API routes (Next.js 14 App Router)
2. **HTTP Methods**: Export `GET`, `POST`, `PUT`, `DELETE` as needed
3. **Error Responses**: Standardized error format

```typescript
return NextResponse.json({
  error: 'Error name',
  details: 'Error details'
}, { status: 500 });
```

4. **Success Responses**: Return data in consistent format

```typescript
return NextResponse.json({
  success: true,
  data: results,
  count: results.length
});
```

### Database Conventions

1. **Table Names**: Lowercase, plural (`accounts`, `friction_cards`)
2. **Columns**: Snake_case (`created_at`, `ofi_score`)
3. **Foreign Keys**: Named `{table}_id` (`account_id`, `user_id`)
4. **Timestamps**: Use `timestamp with time zone`, default `now()`
5. **UUIDs**: Use `uuid` type with `gen_random_uuid()` default
6. **Arrays**: PostgreSQL arrays for multi-value columns (`text[]`)
7. **JSONB**: Use `jsonb` for flexible/nested data

### Migration Conventions

1. **Naming**: `YYYYMMDD_description.sql` (e.g., `20260211_enable_rls_themes.sql`)
2. **Idempotent**: Always use `IF NOT EXISTS` / `IF EXISTS`
3. **Comments**: Add comments explaining why migration is needed
4. **Git**: Commit migrations with descriptive commit message

### Code Organization

1. **No Barrel Exports**: Prefer direct imports over index.ts re-exports
2. **Colocate**: Keep related files close (component + styles + tests)
3. **Utilities**: Generic helpers in `/lib`, specific ones near usage
4. **Types**: Centralized in `/types/index.ts`

### Git Conventions

1. **Commits**: Descriptive messages starting with verb
   - Good: "Add Client field extraction to Jira sync"
   - Bad: "Update files"

2. **Co-Authored**: Always include Claude co-author line
   ```
   Co-Authored-By: Claude (us.anthropic.claude-sonnet-4-5-20250929-v1:0) <noreply@anthropic.com>
   ```

3. **Branch**: Work directly on `main` (no feature branches for now)

---

## Key Gotchas

### 1. Ambiguous Column Names in JOINs

**Problem**: When joining `accounts` and `account_snapshots`, both have `ofi_score` column.

```sql
-- ❌ Ambiguous
SELECT ofi_score FROM accounts a
LEFT JOIN account_snapshots s ON a.id = s.account_id

-- ✅ Qualified
SELECT a.id, s.ofi_score FROM accounts a
LEFT JOIN account_snapshots s ON a.id = s.account_id
```

**Fix**: Always qualify column names with table alias.

### 2. Supabase RLS with Service Role

**Problem**: Cron jobs use service role key, which bypasses RLS. Forgetting this can cause permission errors.

**Solution**:
- Use `createRouteHandlerClient({ cookies })` for user requests
- Use admin client with service role key for cron jobs

```typescript
// User request (RLS enforced)
const supabase = createRouteHandlerClient({ cookies });

// Cron job (RLS bypassed)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

### 3. OAuth Token Refresh Timing

**Problem**: Access tokens expire after 2 hours (Salesforce) or 1 hour (Jira).

**Solution**: Check `expires_at` before API calls, refresh if needed.

```typescript
if (new Date() >= new Date(tokens.expires_at)) {
  // Refresh token logic
  const newTokens = await refreshOAuthToken(integration);
}
```

### 4. Claude API Rate Limits

**Problem**: Anthropic API has rate limits (50 requests/min on paid tier).

**Solution**:
- Batch analysis (10-20 cases per request)
- Add delays between batches if needed
- Handle rate limit errors gracefully

### 5. Vercel Timeout (5 minutes max)

**Problem**: Cron jobs timeout after 5 minutes (300 seconds).

**Solution**:
- Process accounts in batches (50 at a time)
- Update `last_synced_at` at START of job (so UI updates even if timeout)
- Don't process all 1000 accounts in one job

### 6. Next.js App Router Caching

**Problem**: Pages are cached by default in production.

**Solution**: Add `export const dynamic = 'force-dynamic'` to prevent caching.

```typescript
// In page.tsx or route.ts
export const dynamic = 'force-dynamic';
```

### 7. CORS Issues with External APIs

**Problem**: Calling Salesforce/Jira from browser hits CORS errors.

**Solution**: Always proxy through Next.js API routes (server-side).

```typescript
// ❌ Don't do this in browser
fetch('https://salesforce.com/api/...')

// ✅ Do this instead
fetch('/api/salesforce/...')
```

### 8. PostgreSQL Arrays vs JSON Arrays

**Problem**: Confused about when to use `text[]` vs `jsonb`.

**Rule of Thumb**:
- Use `text[]` for simple string arrays (`components`, `labels`)
- Use `jsonb` for structured data (`metadata`, `score_breakdown`)

### 9. Jira Custom Field IDs Change Per Instance

**Problem**: `customfield_12184` is specific to Storable's Jira instance.

**Solution**: Custom field discovery API can find field IDs dynamically.

### 10. Row Counts in Supabase Queries

**Problem**: By default, Supabase doesn't return counts.

```typescript
// ❌ No count
const { data } = await supabase.from('accounts').select('*');

// ✅ With count
const { data, count } = await supabase
  .from('accounts')
  .select('*', { count: 'exact' });
```

### 11. Date Handling Across Timezones

**Problem**: Salesforce dates are in GMT, user is in PST, database is in UTC.

**Solution**: Always store timestamps in UTC, convert in UI using `date-fns`.

```typescript
import { format, parseISO } from 'date-fns';

// Display in user's timezone
format(parseISO(utcTimestamp), 'MMM d, yyyy');
```

### 12. Supabase Query Builder `.eq()` vs `.match()`

**Gotcha**: `.eq()` is for single column, `.match()` for multiple.

```typescript
// Single condition
.eq('status', 'active')

// Multiple conditions
.match({ status: 'active', vertical: 'storage' })
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account (free tier OK)
- Salesforce developer account
- Anthropic API key

### Setup

1. **Clone repo**
   ```bash
   git clone <repo-url>
   cd friction-intelligence
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your keys
   ```

4. **Run database migrations**
   ```sql
   -- In Supabase SQL Editor, run migrations in order:
   -- supabase/migrations/*.sql
   ```

5. **Start dev server**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

6. **Connect Salesforce**
   - Go to Settings → Integrations
   - Click "Connect Salesforce"
   - Complete OAuth flow

7. **Sync data**
   - Click "Sync Now" on Salesforce
   - Wait 1-2 minutes for initial sync

8. **Analyze friction**
   - Go to Dashboard
   - Accounts should appear with OFI scores

### Development Workflow

1. **Make changes** in `/app`, `/components`, or `/lib`
2. **Test locally** with `npm run dev`
3. **Commit** with descriptive message
4. **Push** to trigger Vercel deployment

### Testing

```bash
# Run diagnostic scripts
npx tsx scripts/check-accounts.ts
npx tsx scripts/find-client-custom-field.ts

# Run SQL queries in Supabase SQL Editor
-- scripts/*.sql
```

### Deployment

- **Push to main** → Vercel auto-deploys
- **Environment variables** set in Vercel dashboard
- **Database migrations** run manually in Supabase SQL Editor

---

## Additional Resources

- **Next.js 14 Docs**: https://nextjs.org/docs
- **Supabase Docs**: https://supabase.com/docs
- **Anthropic API**: https://docs.anthropic.com
- **Salesforce REST API**: https://developer.salesforce.com/docs/apis
- **Jira REST API**: https://developer.atlassian.com/cloud/jira/platform/rest/v3

---

**For questions or issues, check `/scripts` for diagnostic tools or review git history for context.**
