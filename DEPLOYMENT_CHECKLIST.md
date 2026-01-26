# Deployment Checklist

Use this checklist to track your progress deploying Friction Intelligence.

## Pre-Deployment ☑️

- [ ] Node.js 18+ installed
- [ ] Git installed
- [ ] Supabase account created
- [ ] Salesforce account with admin access
- [ ] Anthropic API key obtained
- [ ] Vercel account created

## Phase 1: Database Setup ☑️

- [ ] Supabase project created
- [ ] Project name: `friction-intelligence`
- [ ] Database password saved securely
- [ ] `supabase-schema.sql` executed successfully
- [ ] All tables created (verify in Table Editor)
- [ ] Supabase URL copied
- [ ] Supabase anon key copied
- [ ] Supabase service role key copied (keep secret!)

## Phase 2: Authentication ☑️

- [ ] Google OAuth configured in Supabase
- [ ] Google Cloud Console project created
- [ ] OAuth 2.0 credentials created
- [ ] Redirect URI added: `https://[PROJECT-REF].supabase.co/auth/v1/callback`
- [ ] Client ID and Secret added to Supabase
- [ ] Test login working in Supabase auth preview

## Phase 3: Salesforce Integration ☑️

- [ ] Salesforce Connected App created
- [ ] OAuth settings enabled
- [ ] Callback URL set: `https://[YOUR-APP].vercel.app/api/auth/salesforce/callback`
- [ ] Required OAuth scopes selected
- [ ] Consumer Key (Client ID) copied
- [ ] Consumer Secret copied
- [ ] API access verified for your Salesforce user

## Phase 4: Local Development (Optional) ☑️

- [ ] Project code downloaded/cloned
- [ ] Dependencies installed (`npm install`)
- [ ] `.env.local` file created from `.env.example`
- [ ] All environment variables filled in
- [ ] Local dev server started (`npm run dev`)
- [ ] http://localhost:3000 loads successfully
- [ ] Login working locally
- [ ] Salesforce OAuth working locally

## Phase 5: Vercel Deployment ☑️

- [ ] Vercel CLI installed (`npm install -g vercel`)
- [ ] Logged into Vercel (`vercel login`)
- [ ] Initial deployment completed (`vercel`)
- [ ] Production deployment URL obtained
- [ ] All environment variables added in Vercel dashboard:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `SALESFORCE_CLIENT_ID`
  - [ ] `SALESFORCE_CLIENT_SECRET`
  - [ ] `SALESFORCE_REDIRECT_URI`
  - [ ] `ANTHROPIC_API_KEY`
  - [ ] `NEXT_PUBLIC_APP_URL`
- [ ] Production deployment completed (`vercel --prod`)
- [ ] App accessible at production URL
- [ ] SSL certificate active (https working)

## Phase 6: Salesforce Callback Update ☑️

- [ ] Salesforce Connected App callback URL updated to production URL
- [ ] Changes saved in Salesforce
- [ ] OAuth tested with production URL

## Phase 7: Edge Functions ☑️

- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] Logged into Supabase CLI (`supabase login`)
- [ ] Project linked (`supabase link --project-ref [REF]`)
- [ ] Anthropic API key set as secret
- [ ] `analyze-friction` function deployed
- [ ] Function logs showing no errors
- [ ] Test function invocation successful

## Phase 8: Initial Testing ☑️

- [ ] Production app opens successfully
- [ ] Google login works
- [ ] User redirected to dashboard after login
- [ ] "Connect Salesforce" button visible
- [ ] Salesforce OAuth flow completes
- [ ] Redirected back to app after Salesforce auth
- [ ] "Salesforce connected" message appears
- [ ] Initial sync triggered (check Supabase logs)
- [ ] Accounts appear in database (check Table Editor)
- [ ] Top 25 portfolio generated
- [ ] Random sample portfolio generated
- [ ] Dashboard shows account cards
- [ ] Can click into account detail page
- [ ] OFI score visible on account page
- [ ] Trend chart rendering

## Phase 9: Data Verification ☑️

- [ ] At least 1 account in `accounts` table
- [ ] At least 1 raw input in `raw_inputs` table
- [ ] At least 1 friction card in `friction_cards` table
- [ ] At least 1 snapshot in `account_snapshots` table
- [ ] Portfolio records in `portfolios` table
- [ ] Integration record in `integrations` table
- [ ] OAuth token stored in `oauth_tokens` table

## Phase 10: Feature Testing ☑️

- [ ] Dashboard loads without errors
- [ ] Top 25 section shows accounts
- [ ] Random Sample section shows accounts
- [ ] Account cards display correctly
- [ ] Can click through to account detail
- [ ] Account detail page shows:
  - [ ] OFI score
  - [ ] Trend chart
  - [ ] Friction cards
  - [ ] Theme groupings
  - [ ] Evidence snippets (when expanded)
- [ ] Share button creates shareable link
- [ ] Shared link works in incognito window
- [ ] Sort options work (OFI vs ARR)
- [ ] Refresh portfolio button works

## Phase 11: Polish & Performance ☑️

- [ ] All console errors resolved
- [ ] No TypeScript errors
- [ ] Page load times acceptable (<3s)
- [ ] Mobile responsive (test on phone)
- [ ] Images/icons loading correctly
- [ ] Charts rendering properly
- [ ] No broken links
- [ ] Error states handle gracefully

## Phase 12: Documentation ☑️

- [ ] README.md reviewed
- [ ] QUICKSTART.md reviewed
- [ ] Team members invited (if multi-user)
- [ ] Internal docs updated with app URL
- [ ] Demo video recorded (optional but recommended)

## Phase 13: Monitoring & Maintenance ☑️

- [ ] Supabase project monitoring enabled
- [ ] Vercel analytics reviewed
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Daily sync cron job configured
- [ ] Backup strategy documented
- [ ] Support contact information added

## Launch Checklist ☑️

- [ ] Stakeholders notified
- [ ] Training session scheduled (if needed)
- [ ] Feedback mechanism in place
- [ ] Iteration plan created
- [ ] Success metrics defined

---

## Troubleshooting Reference

**Issue**: Can't login
- Check: Google OAuth credentials in Supabase
- Check: Redirect URI matches exactly
- Check: Email domain allowed (if domain restriction enabled)

**Issue**: Salesforce connection fails
- Check: Callback URL in Salesforce matches production URL
- Check: OAuth credentials correct in environment variables
- Check: User has API access in Salesforce

**Issue**: No data showing
- Check: Supabase functions logs for errors
- Check: Anthropic API key is valid
- Check: Raw inputs exist in database
- Check: Edge function deployed and running

**Issue**: OFI score always 0
- Check: Friction cards exist in database
- Check: Account snapshots being generated
- Check: `calculate_ofi_score()` function working

**Issue**: Charts not rendering
- Check: Browser console for JavaScript errors
- Check: Recharts dependency installed
- Check: Data format matches chart expectations

---

## Success Criteria

Your deployment is successful when:
✅ Users can login with Google
✅ Salesforce syncs account data
✅ Friction cards auto-generate from data
✅ OFI scores calculated and trending
✅ Dashboards are interactive and responsive
✅ Share links work for collaboration

## Next Steps After Launch

1. Gather user feedback for 1 week
2. Iterate on friction theme taxonomy
3. Add manual input functionality
4. Set up automated daily syncs
5. Configure alerts (Slack/email)
6. Expand to additional data sources
7. Build custom reports

---

**Notes:**
- Take screenshots of each successful step
- Save all credentials in password manager
- Document any custom changes
- Keep this checklist updated as you iterate
