# Quick Start Guide - Get Running in 1 Hour

This guide will get you from zero to a working demo in about 60 minutes.

## What You'll Build

By the end of this guide, you'll have:
- ✅ A working web app with Google login
- ✅ Salesforce connected and pulling account data
- ✅ AI-powered friction analysis running
- ✅ Top 25 and Random Sample portfolios auto-generated
- ✅ Beautiful dashboards with charts and insights

## Time Breakdown

- ⏱️ 15 min: Supabase setup
- ⏱️ 10 min: Salesforce OAuth
- ⏱️ 15 min: Deploy app to Vercel
- ⏱️ 10 min: Set up Edge Functions
- ⏱️ 10 min: Test and verify

## Step-by-Step

### 1. Supabase Setup (15 minutes)

**Create Project:**
1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Name it "friction-intelligence"
4. Choose a strong database password
5. Select region closest to you
6. Wait for provisioning (~2 minutes)

**Run Schema:**
1. Go to SQL Editor in left sidebar
2. Click "New Query"
3. Copy entire contents of `supabase-schema.sql`
4. Paste and click "Run"
5. Should see "Success. No rows returned"

**Enable Google Auth:**
1. Go to Authentication → Providers
2. Find Google, click to expand
3. Toggle "Enabled"
4. Add your Google OAuth credentials:
   - Get from: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Create OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: `https://[YOUR-PROJECT-REF].supabase.co/auth/v1/callback`
5. Copy Client ID and Secret to Supabase
6. Save

**Get API Keys:**
1. Go to Project Settings → API
2. Copy these for later:
   - Project URL
   - anon public key
   - service_role key (keep this secret!)

### 2. Salesforce OAuth (10 minutes)

**Create Connected App:**
1. Login to Salesforce
2. Setup → App Manager → New Connected App
3. Fill in:
   - Name: "Friction Intelligence"
   - Contact Email: your email
   - Enable OAuth Settings: ✓
   - Callback URL: `https://[YOUR-VERCEL-APP].vercel.app/api/auth/salesforce/callback`
   - Scopes: Select all (you can restrict later)
4. Save

**Get Credentials:**
1. Find your new Connected App
2. Click "View"
3. Copy Consumer Key
4. Click "Manage Consumer Details"
5. Copy Consumer Secret
6. Save these for later

### 3. Deploy to Vercel (15 minutes)

**Prepare Code:**
```bash
# Clone your repo
git clone [your-repo-url]
cd friction-intelligence

# Install dependencies
npm install
```

**Deploy:**
```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name: friction-intelligence
# - Deploy? Yes
```

**Add Environment Variables:**

In Vercel Dashboard → Settings → Environment Variables, add:

```
NEXT_PUBLIC_SUPABASE_URL=https://[your-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SALESFORCE_CLIENT_ID=your-salesforce-consumer-key
SALESFORCE_CLIENT_SECRET=your-salesforce-consumer-secret
SALESFORCE_REDIRECT_URI=https://[your-app].vercel.app/api/auth/salesforce/callback
ANTHROPIC_API_KEY=your-anthropic-key
NEXT_PUBLIC_APP_URL=https://[your-app].vercel.app
```

**Redeploy:**
```bash
vercel --prod
```

### 4. Set Up Edge Functions (10 minutes)

**Install Supabase CLI:**
```bash
npm install -g supabase
```

**Login and Link:**
```bash
supabase login
supabase link --project-ref [your-project-ref]
```

**Set Function Secrets:**
```bash
supabase secrets set ANTHROPIC_API_KEY=your-key
```

**Deploy Functions:**
```bash
# Deploy the friction analysis function
supabase functions deploy analyze-friction
```

### 5. Test Everything (10 minutes)

**Open Your App:**
1. Go to `https://[your-app].vercel.app`
2. Click "Login with Google"
3. Authorize with your work email

**Connect Salesforce:**
1. Click "Connect Salesforce" button
2. Authorize the app
3. Wait for redirect back
4. You should see "Salesforce connected!"

**Trigger Initial Sync:**

In Supabase SQL Editor, run:
```sql
-- This will trigger portfolio generation
SELECT * FROM accounts LIMIT 1;
```

Or manually call the edge function via Supabase dashboard.

**Verify Data:**
1. Dashboard should load
2. You should see accounts in Top 25
3. Click an account
4. You should see OFI score and trends

## Troubleshooting Common Issues

### "Supabase connection failed"
- Check environment variables in Vercel
- Verify NEXT_PUBLIC_SUPABASE_URL is correct
- Check if anon key is valid

### "Salesforce auth failed"
- Verify callback URL in Salesforce matches Vercel deployment
- Check OAuth credentials are correct
- Make sure your Salesforce user has API access

### "No data appearing"
- Check Supabase → Functions → Logs
- Verify edge function deployed successfully
- Run manual sync via SQL or edge function call

### "OFI score is always 0"
- Check if friction_cards table has data
- Verify analyze-friction function is working
- Check Anthropic API key is valid

## Next Steps

Once everything is working:

1. **Add Manual Input**: Create a page to manually add friction notes
2. **Set Up Daily Sync**: Schedule the salesforce-sync function
3. **Enable Alerts**: Configure Slack or email notifications
4. **Invite Team**: Add more Google accounts for your team
5. **Customize Themes**: Add industry-specific friction categories

## Getting Help

- Check logs in Supabase → Functions
- Check network tab in browser DevTools
- Review README.md for detailed documentation
- Create GitHub issue with error logs

## What's Next?

Now that you have the foundation:
- Start adding real customer data
- **Generate Visit Briefings** before customer meetings (click "Visit Briefing" on any account)
- Refine the friction themes for your industry
- Share account views with your team
- Use insights in product roadmap meetings
- Track improvements over time

Enjoy your new friction intelligence platform! 🎉
