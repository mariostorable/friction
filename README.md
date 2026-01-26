# Friction Intelligence Platform

An early-warning system for customer friction that provides explainable, actionable insights from unstructured customer data.

## Overview

This platform automatically:
- Connects to Salesforce and extracts customer interaction data
- Uses AI to identify and classify friction signals
- Tracks trends over time with the Operational Friction Index (OFI)
- Provides explainable insights with evidence and reasoning
- Auto-generates Top 25 and Random Sample portfolios

## Key Features

### 1. **Auto-Discovery Portfolios**
- **Top 25**: Automatically tracks your 25 highest ARR accounts
- **Random Sample**: Weekly refresh of 50 random smaller accounts
- Zero manual configuration required

### 2. **Explainable AI Analysis**
Every friction signal includes:
- Plain English summary
- Root cause hypothesis
- Evidence snippets from source data
- Confidence score
- Detailed reasoning

### 3. **Operational Friction Index (OFI)**
- Normalized 0-100 score
- Daily snapshots for trend analysis
- Score breakdown showing exact calculation
- Trend indicators (improving/stable/worsening)

### 4. **Beautiful, User-Friendly UI**
- Click-through from dashboard to detailed account views
- Expandable friction cards showing full analysis
- Interactive charts and visualizations
- Shareable links for collaboration

### 5. **Customer Visit Briefings** 🆕
- AI-generated briefings for customer meetings
- **Quick Brief** (2-3 min read): Top issues, talking points, recent wins
- **Deep Brief** (10 min read): Full history, opportunities, risk analysis
- Download as text or email to yourself
- Real-time generation using latest account data

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **AI**: Claude API (Anthropic)
- **Integrations**: Salesforce (OAuth + REST API)
- **Charts**: Recharts
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier works)
- Salesforce account with API access
- Anthropic API key
- Vercel account (for deployment)

### Step 1: Clone and Install

```bash
git clone <your-repo>
cd friction-intelligence
npm install
```

### Step 2: Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor
3. Run the entire `supabase-schema.sql` file
4. Enable Google Auth:
   - Go to Authentication → Providers
   - Enable Google
   - Add your Google OAuth credentials

5. Get your Supabase credentials:
   - Go to Project Settings → API
   - Copy the URL and anon key

### Step 3: Set Up Salesforce OAuth

1. In Salesforce Setup, create a Connected App:
   - Navigate to: Setup → Apps → App Manager → New Connected App
   - Basic Information:
     - Connected App Name: "Friction Intelligence"
     - API Name: "Friction_Intelligence"
     - Contact Email: your email
   - API (Enable OAuth Settings):
     - Enable OAuth Settings: ✓
     - Callback URL: `https://your-domain.vercel.app/api/auth/salesforce/callback`
     - Selected OAuth Scopes:
       - Access and manage your data (api)
       - Perform requests on your behalf at any time (refresh_token, offline_access)
       - Access your basic information (id, profile, email, address, phone)
   - Save and continue

2. Get your credentials:
   - Consumer Key (Client ID)
   - Consumer Secret (Client Secret)
   - Keep these secure!

### Step 4: Configure Environment Variables

Create a `.env.local` file:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Salesforce
SALESFORCE_CLIENT_ID=your-salesforce-consumer-key
SALESFORCE_CLIENT_SECRET=your-salesforce-consumer-secret
SALESFORCE_REDIRECT_URI=http://localhost:3000/api/auth/salesforce/callback

# Anthropic (for AI analysis)
ANTHROPIC_API_KEY=your-anthropic-api-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 5: Create Supabase Edge Functions

You'll need to create three Edge Functions:

#### a) Salesforce Sync (`supabase/functions/salesforce-sync/index.ts`)

This function runs daily to pull data from Salesforce.

#### b) Friction Analysis (`supabase/functions/analyze-friction/index.ts`)

This function processes raw inputs and creates friction cards using Claude API.

#### c) Portfolio Refresh (`supabase/functions/refresh-portfolio/index.ts`)

This function regenerates Top 25 and Random Sample portfolios.

Deploy functions:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy functions
supabase functions deploy salesforce-sync
supabase functions deploy analyze-friction
supabase functions deploy refresh-portfolio
```

### Step 6: Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Step 7: Deploy to Production

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
# Then redeploy:
vercel --prod
```

## Usage

### First-Time Setup

1. **Login**: Click "Login with Google" using your work email
2. **Connect Salesforce**:
   - Click "Connect Salesforce"
   - Authorize the app
   - Wait for initial sync (may take 1-2 minutes)
3. **Portfolios Auto-Generate**:
   - Top 25 created based on ARR
   - Random Sample created automatically
4. **Start Exploring**: Click any account to see detailed friction analysis

### Daily Workflow

1. **Check Dashboard**: See portfolio overview and alerts
2. **Review Spikes**: Accounts with increasing friction appear first
3. **Drill Into Details**: Click account → see friction cards with evidence
4. **Share Insights**: Click "Share" to create links for team
5. **Track Trends**: Monitor OFI score changes over time

### Understanding the OFI Score

The Operational Friction Index (OFI) is calculated as:

```
OFI = (Severity-Weighted Signals × Recency Factor) / Normalization
```

Where:
- **Severity 5 (Critical)**: 10 points
- **Severity 4 (High)**: 5 points
- **Severity 3 (Medium)**: 2 points
- **Severity 2 (Low)**: 1 point
- **Severity 1 (Minimal)**: 0.5 points

The score is normalized to 0-100:
- **0-30**: Healthy (low friction)
- **30-50**: Moderate (watch for trends)
- **50-70**: Elevated (action recommended)
- **70-100**: Critical (immediate attention)

### Interpreting Friction Cards

Each friction card shows:

1. **Summary**: One-sentence plain English description
2. **Theme**: Category of friction (billing, integration, etc.)
3. **Severity**: 1-5 scale
4. **Sentiment**: Customer emotional state
5. **Evidence**: Direct quotes supporting the analysis
6. **Root Cause**: Hypothesis about underlying issue
7. **Confidence**: How certain the AI is (0-100%)
8. **Reasoning**: Explanation of how Claude arrived at this conclusion

**Expanding a card** reveals all analysis details and source links.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 User Interface                   │
│         (Next.js + React + Tailwind)            │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              Supabase Auth                       │
│         (Google SSO + RLS)                       │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│           PostgreSQL Database                    │
│  - Accounts, Friction Cards, Snapshots          │
│  - Row Level Security for data isolation        │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│          Supabase Edge Functions                │
│  1. Salesforce Sync (daily)                     │
│  2. Friction Analysis (on new data)             │
│  3. Portfolio Refresh (weekly)                  │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│          External Integrations                   │
│  - Salesforce (OAuth + REST API)                │
│  - Claude API (friction analysis)               │
└─────────────────────────────────────────────────┘
```

## Data Security

- **Authentication**: Google SSO only (work email required)
- **Authorization**: Row Level Security (RLS) ensures users only see their own data
- **OAuth Tokens**: Encrypted at rest, never exposed to frontend
- **Shared Links**: Token-based with expiration (7 days default)
- **API Keys**: Stored in environment variables, never in code

## Extending the Platform

### Adding New Data Sources

1. Create integration entry in `integrations` table
2. Add OAuth flow or API key storage
3. Create sync function to pull data
4. Map to `raw_inputs` table
5. Existing friction analysis works automatically

### Adding New Themes

```sql
INSERT INTO themes (theme_key, label, description, category, severity_weight)
VALUES (
  'new_theme_key',
  'Human Readable Label',
  'Description of what this theme represents',
  'product', -- or 'process', 'training', 'integration'
  1.5 -- severity multiplier
);
```

### Customizing OFI Calculation

Edit the `calculate_ofi_score()` function in Supabase:

```sql
CREATE OR REPLACE FUNCTION calculate_ofi_score(
    p_account_id UUID,
    p_period_days INTEGER DEFAULT 14
) RETURNS NUMERIC AS $$
-- Your custom logic here
$$ LANGUAGE plpgsql;
```

## Troubleshooting

### Salesforce Connection Issues

**Problem**: "Failed to connect to Salesforce"
- Check OAuth credentials in `.env.local`
- Verify callback URL in Salesforce Connected App
- Ensure user has API access enabled

### No Data Appearing

**Problem**: Connected but no accounts/friction cards
- Check Supabase functions logs: `supabase functions logs salesforce-sync`
- Verify RLS policies allow your user to read data
- Run manual sync: Call edge function directly

### OFI Score Always Zero

**Problem**: Accounts show but OFI is 0
- Check if friction cards exist for account
- Verify `analyze-friction` function is running
- Check Claude API key is valid

## Support

- **Documentation**: See `/docs` folder for detailed guides
- **Issues**: Create GitHub issue with error logs
- **Contact**: your-email@storable.com

## Roadmap

- [ ] Multi-user collaboration with comments
- [ ] Zendesk integration
- [ ] Gong call transcript analysis
- [ ] Slack integration for alerts
- [ ] Mobile app
- [ ] Churn prediction model
- [ ] Automated QBR report generation
- [ ] Customer-facing portal (opt-in)

## License

Proprietary - Storable Internal Use Only
