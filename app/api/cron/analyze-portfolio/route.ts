import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDecryptedToken, updateEncryptedAccessToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes (Vercel Hobby plan limit)

// Helper function: sleep for rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function: retry with exponential backoff for API 529 errors
async function callAnthropicWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If 529 (overloaded), retry with exponential backoff
      if (response.status === 529) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
        console.log(`API overloaded (529), retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(waitTime);
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw new Error('Max retries exceeded');
}

export async function GET(request: NextRequest) {
  console.log('=== Analyze Portfolio Endpoint Called ===');

  // ?recalculate=true skips the "already analyzed today" check to force re-scoring
  const recalculate = request.nextUrl.searchParams.get('recalculate') === 'true';
  if (recalculate) {
    console.log('RECALCULATE mode: will overwrite existing snapshots from today');
  }

  // TEMPORARILY DISABLED: Verify cron secret
  const authHeader = request.headers.get('authorization');
  console.log('Auth header present:', !!authHeader);
  console.log('CRON_SECRET configured:', !!process.env.CRON_SECRET);

  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   console.error('Authorization failed - auth mismatch');
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  console.log('Auth check disabled for testing, starting analysis...');

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Clean up expired alerts
    const { error: cleanupError } = await supabase
      .from('alerts')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (cleanupError) {
      console.error('Error cleaning up expired alerts:', cleanupError);
    } else {
      console.log('✓ Expired alerts cleaned up');
    }

    // Get all users with portfolios (Storage and Marine)
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('user_id, account_ids, portfolio_type')
      .in('portfolio_type', ['top_25_edge', 'top_25_sitelink', 'top_25_marine']);

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ message: 'No portfolios found' });
    }

    const results = [];
    let accountsAnalyzed = 0;
    const MAX_ANALYSES_PER_RUN = 50; // Process up to 50 accounts per run (limited by 5-min timeout)

    for (const portfolio of portfolios) {
      // Skip marine portfolio - Newbook (NBK) is a different vertical (RV/campgrounds)
      // and its cases don't map to self-storage friction themes
      if (portfolio.portfolio_type === 'top_25_marine') {
        console.log(`Skipping marine portfolio - different vertical (Newbook/RV)`);
        continue;
      }

      for (const accountId of portfolio.account_ids) {
        try {
          // Get account details (skip cancelled accounts), include products for context
          const { data: account } = await supabase
            .from('accounts')
            .select('salesforce_id, name, status, products, vertical')
            .eq('id', accountId)
            .single();

          if (!account) continue;

          // Skip cancelled accounts
          if (account.status === 'cancelled' || account.status === 'churned') {
            console.log(`Skipping ${account.name} - account is ${account.status}`);
            results.push({
              accountId,
              account: account.name,
              status: 'skipped',
              reason: `Account is ${account.status}`
            });
            continue;
          }

          // Check if account already has a snapshot from today
          const today = new Date().toISOString().split('T')[0];
          const { data: existingSnapshot } = await supabase
            .from('account_snapshots')
            .select('id, ofi_score')
            .eq('account_id', accountId)
            .eq('snapshot_date', today)
            .maybeSingle();

          if (existingSnapshot) {
            if (!recalculate) {
              console.log(`Skipping ${account.name} - already analyzed today (OFI: ${existingSnapshot.ofi_score})`);
              results.push({
                accountId,
                account: account.name,
                status: 'skipped',
                ofi: existingSnapshot.ofi_score,
                reason: 'Already analyzed today'
              });
              continue;
            }
            // In recalculate mode: delete today's snapshot so we can replace it
            console.log(`Recalculate mode: deleting existing snapshot for ${account.name} (OFI: ${existingSnapshot.ofi_score})`);
            await supabase
              .from('account_snapshots')
              .delete()
              .eq('id', existingSnapshot.id);
          }

          // Stop after analyzing MAX_ANALYSES_PER_RUN accounts to avoid timeout
          if (accountsAnalyzed >= MAX_ANALYSES_PER_RUN) {
            console.log(`Reached max analysis limit (${MAX_ANALYSES_PER_RUN}), stopping to avoid timeout`);
            break;
          }

          // Get integration
          const { data: integration } = await supabase
            .from('integrations')
            .select('*')
            .eq('user_id', portfolio.user_id)
            .eq('integration_type', 'salesforce')
            .single();

          if (!integration) continue;

          // Retrieve and decrypt tokens
          let tokens;
          try {
            tokens = await getDecryptedToken(supabase, integration.id);
          } catch (error) {
            console.error(`Failed to decrypt tokens for user ${portfolio.user_id}:`, error);
            continue;
          }

          if (!tokens) {
            console.log(`No tokens found for integration ${integration.id}`);
            continue;
          }

          // Helper function to refresh Salesforce token
          const refreshSalesforceToken = async () => {
            if (!tokens.refresh_token) {
              throw new Error('No refresh token available');
            }

            const refreshResponse = await fetch('https://storable.my.salesforce.com/services/oauth2/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token,
                client_id: process.env.SALESFORCE_CLIENT_ID!,
                client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
              }),
            });

            if (!refreshResponse.ok) {
              throw new Error('Failed to refresh Salesforce token');
            }

            const refreshData = await refreshResponse.json();

            // Update encrypted token in database
            await updateEncryptedAccessToken(
              supabase,
              tokens.id,
              refreshData.access_token,
              new Date(Date.now() + 7200000).toISOString()
            );

            return refreshData.access_token;
          };

          // Fetch ALL cases from Salesforce (looking back 90 days, most recent first) - Explicit LIMIT 2000 (Salesforce defaults to 100 without explicit limit)
          const query = `SELECT Id,CaseNumber,Subject,Description,Status,Priority,CreatedDate,Origin FROM Case WHERE AccountId='${account.salesforce_id}' AND CreatedDate=LAST_N_DAYS:90 ORDER BY CreatedDate DESC LIMIT 2000`;
          console.log(`Fetching cases for account: ${account.name} (${account.salesforce_id})`);

          // Helper function to fetch cases
          const fetchCases = async (accessToken: string) => {
            return await fetch(
              `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              }
            );
          };

          // Try to fetch cases, refresh token if expired
          let casesResponse = await fetchCases(tokens.access_token);

          // If 401 Unauthorized, refresh token and retry
          if (casesResponse.status === 401) {
            console.log(`Access token expired for ${account.name}, refreshing...`);
            try {
              const newAccessToken = await refreshSalesforceToken();
              casesResponse = await fetchCases(newAccessToken);
            } catch (refreshError) {
              console.error(`Failed to refresh token for ${account.name}:`, refreshError);
              results.push({ accountId, account: account.name, status: 'failed', error: 'Token refresh failed' });
              continue;
            }
          }

          if (!casesResponse.ok) {
            console.error(`Failed to fetch cases for ${account.name}:`, casesResponse.status);
            results.push({ accountId, account: account.name, status: 'failed', error: 'Salesforce fetch failed' });
            continue;
          }

          const casesData = await casesResponse.json();
          console.log(`Found ${casesData.records?.length || 0} cases for ${account.name}`);

          // Get existing raw_inputs to avoid re-analyzing cases we already processed
          const { data: existingInputs } = await supabase
            .from('raw_inputs')
            .select('source_id')
            .eq('account_id', accountId)
            .eq('source_type', 'salesforce_case');

          const existingCaseIds = new Set(existingInputs?.map(i => i.source_id) || []);
          console.log(`Account has ${existingCaseIds.size} existing analyzed cases`);

          if (!casesData.records || casesData.records.length === 0) {
            // Get yesterday's snapshot for trend comparison
            const todayDateStr = new Date().toISOString().split('T')[0];
            const { data: previousSnapshot } = await supabase
              .from('account_snapshots')
              .select('ofi_score')
              .eq('account_id', accountId)
              .lt('snapshot_date', todayDateStr)
              .order('snapshot_date', { ascending: false })
              .limit(1)
              .maybeSingle();

            let trendVsPriorPeriod = null;
            let trendDirection: 'improving' | 'stable' | 'worsening' = 'stable';

            if (previousSnapshot && previousSnapshot.ofi_score !== null) {
              trendVsPriorPeriod = 0 - previousSnapshot.ofi_score;
              if (trendVsPriorPeriod < -3) {
                trendDirection = 'improving'; // Was higher, now 0 = improving
              } else if (Math.abs(trendVsPriorPeriod) <= 3) {
                trendDirection = 'stable';
              }
            }

            // Create snapshot with OFI 0 for accounts with no cases
            const { error: snapshotError } = await supabase.from('account_snapshots').insert({
              account_id: accountId,
              snapshot_date: new Date().toISOString().split('T')[0],
              ofi_score: 0,
              friction_card_count: 0,
              high_severity_count: 0,
              case_volume: 0,
              top_themes: [],
              score_breakdown: {
                base_score: 0,
                friction_density: 0,
                density_multiplier: 0,
                high_severity_boost: 0,
                severity_weighted: 0,
                card_count: 0
              },
              trend_vs_prior_period: trendVsPriorPeriod,
              trend_direction: trendDirection
            });

            if (snapshotError) {
              console.error(`Error creating snapshot for ${account.name}:`, snapshotError);
              results.push({ accountId, account: account.name, status: 'snapshot_error', error: snapshotError.message });
            } else {
              console.log(`✓ Snapshot created for ${account.name} with OFI 0 (no cases)`);
              results.push({ accountId, account: account.name, status: 'no_cases', cases: 0, ofi: 0 });
            }
            accountsAnalyzed++; // Count this as analyzed
            continue;
          }

          // Filter to only NEW cases (ones we haven't analyzed yet)
          const newCases = casesData.records.filter((sfCase: any) => !existingCaseIds.has(sfCase.Id));
          console.log(`${newCases.length} new cases to analyze (${existingCaseIds.size} already analyzed)`);

          if (newCases.length === 0) {
            // No new cases, but recalculate OFI from existing cards (90-day window)
            console.log(`No new cases for ${account.name}, recalculating OFI from existing cards...`);

            const ninetyDaysAgoStr = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            // Get friction cards from last 90 days only (windowed so scores can decrease)
            const { data: existingCards } = await supabase
              .from('friction_cards')
              .select('*')
              .eq('account_id', accountId)
              .eq('is_friction', true)
              .gte('created_at', ninetyDaysAgoStr);

            if (!existingCards || existingCards.length === 0) {
              // No cards at all, create OFI 0 snapshot
              const todayDateStr2 = new Date().toISOString().split('T')[0];
              const { data: previousSnapshot } = await supabase
                .from('account_snapshots')
                .select('ofi_score')
                .eq('account_id', accountId)
                .lt('snapshot_date', todayDateStr2)
                .order('snapshot_date', { ascending: false })
                .limit(1)
                .maybeSingle();

              let trendVsPriorPeriod = null;
              let trendDirection: 'improving' | 'stable' | 'worsening' = 'stable';

              if (previousSnapshot && previousSnapshot.ofi_score !== null) {
                trendVsPriorPeriod = 0 - previousSnapshot.ofi_score;
                if (trendVsPriorPeriod < -3) {
                  trendDirection = 'improving';
                } else if (Math.abs(trendVsPriorPeriod) <= 3) {
                  trendDirection = 'stable';
                }
              }

              await supabase.from('account_snapshots').insert({
                account_id: accountId,
                snapshot_date: new Date().toISOString().split('T')[0],
                ofi_score: 0,
                friction_card_count: 0,
                high_severity_count: 0,
                case_volume: casesData.records.length,
                top_themes: [],
                score_breakdown: {
                  base_score: 0,
                  friction_density: 0,
                  density_multiplier: 0,
                  high_severity_boost: 0,
                  severity_weighted: 0,
                  card_count: 0
                },
                trend_vs_prior_period: trendVsPriorPeriod,
                trend_direction: trendDirection
              });

              console.log(`✓ Snapshot created for ${account.name} with OFI 0 (no friction cards)`);
              results.push({ accountId, account: account.name, status: 'no_new_cases', cases: 0, ofi: 0 });
              accountsAnalyzed++;
              continue;
            }

            // Calculate OFI from 90-day windowed cards - gentler weights for better distribution
            const highSeverityCount = existingCards.filter(c => c.severity >= 4).length;
            const severityWeights: any = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };
            const weightedScore = existingCards.reduce((sum, card) => sum + (severityWeights[card.severity] || 1), 0);
            const totalCases = casesData.records.length || 1;
            const frictionDensity = (existingCards.length / totalCases) * 100;
            const baseScore = Math.log10(weightedScore + 1) * 15;
            const densityMultiplier = Math.min(1.5, Math.max(0.5, frictionDensity / 5));
            const highSeverityBoost = Math.min(15, highSeverityCount * 1.5);
            let ofiScore = Math.round(baseScore * densityMultiplier + highSeverityBoost);
            ofiScore = Math.min(100, Math.max(0, ofiScore));

            // Calculate top themes
            const themeMap = new Map<string, { count: number, totalSeverity: number }>();
            existingCards.forEach(card => {
              const existing = themeMap.get(card.theme_key) || { count: 0, totalSeverity: 0 };
              existing.count++;
              existing.totalSeverity += card.severity;
              themeMap.set(card.theme_key, existing);
            });

            const topThemes = Array.from(themeMap.entries())
              .map(([theme_key, data]) => ({
                theme_key,
                count: data.count,
                avg_severity: data.totalSeverity / data.count
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5);

            // Get yesterday's snapshot for trend comparison
            const todayStr = new Date().toISOString().split('T')[0];
            const { data: previousSnapshot } = await supabase
              .from('account_snapshots')
              .select('ofi_score')
              .eq('account_id', accountId)
              .lt('snapshot_date', todayStr)
              .order('snapshot_date', { ascending: false })
              .limit(1)
              .maybeSingle();

            let trendVsPriorPeriod = null;
            let trendDirection: 'improving' | 'stable' | 'worsening' = 'stable';

            if (previousSnapshot && previousSnapshot.ofi_score !== null) {
              trendVsPriorPeriod = ofiScore - previousSnapshot.ofi_score;
              if (trendVsPriorPeriod > 3) {
                trendDirection = 'worsening';
              } else if (trendVsPriorPeriod < -3) {
                trendDirection = 'improving';
              }
            }

            await supabase.from('account_snapshots').insert({
              account_id: accountId,
              snapshot_date: new Date().toISOString().split('T')[0],
              ofi_score: ofiScore,
              friction_card_count: existingCards.length,
              high_severity_count: highSeverityCount,
              case_volume: totalCases,
              top_themes: topThemes,
              score_breakdown: {
                base_score: Math.round(baseScore * 10) / 10,
                friction_density: Math.round(frictionDensity * 10) / 10,
                density_multiplier: Math.round(densityMultiplier * 100) / 100,
                high_severity_boost: highSeverityBoost,
                severity_weighted: weightedScore,
                card_count: existingCards.length
              },
              trend_vs_prior_period: trendVsPriorPeriod,
              trend_direction: trendDirection
            });

            console.log(`✓ Snapshot created for ${account.name} with OFI ${ofiScore} (recalculated from ${existingCards.length} existing cards)`);
            results.push({ accountId, account: account.name, status: 'no_new_cases', cases: 0, ofi: ofiScore });
            accountsAnalyzed++;
            continue;
          }

          // Store raw inputs for NEW cases only
          const rawInputs = newCases.map((sfCase: any) => ({
            user_id: portfolio.user_id,
            account_id: accountId,
            source_type: 'salesforce_case',
            source_id: sfCase.Id,
            source_url: `${integration.instance_url}/${sfCase.Id}`,
            text_content: `Case #${sfCase.CaseNumber}: ${sfCase.Subject}\n\n${sfCase.Description || 'No description'}`,
            metadata: {
              case_number: sfCase.CaseNumber,
              subject: sfCase.Subject,
              status: sfCase.Status,
              origin: sfCase.Origin || 'Unknown',
              created_date: sfCase.CreatedDate,
            },
            processed: false,
          }));

          const { data: insertedInputs } = await supabase.from('raw_inputs').insert(rawInputs).select();

          // Also fetch any unprocessed inputs from other sources (e.g., Vitally notes)
          const { data: unprocessedInputs } = await supabase
            .from('raw_inputs')
            .select('*')
            .eq('account_id', accountId)
            .eq('processed', false)
            .neq('source_type', 'salesforce_case'); // Don't duplicate the ones we just inserted

          // Combine newly inserted Salesforce cases with unprocessed inputs from other sources
          const allInputsToAnalyze = [...(insertedInputs || []), ...(unprocessedInputs || [])];

          if (allInputsToAnalyze.length === 0) {
            console.log(`No inputs to analyze for ${account.name}`);
            continue;
          }

          // Analyze ALL inputs (Salesforce cases + Vitally notes + other sources)
          const frictionCards = [];
          console.log(`Analyzing ${allInputsToAnalyze.length} inputs for ${account.name} (${insertedInputs?.length || 0} new Salesforce cases + ${unprocessedInputs?.length || 0} other sources)...`);

          for (let i = 0; i < allInputsToAnalyze.length; i++) {
            const input = allInputsToAnalyze[i];

            // Log progress every 20 cases
            if (i % 20 === 0 && i > 0) {
              console.log(`Progress: ${i}/${allInputsToAnalyze.length} inputs analyzed for ${account.name}`);
            }

            // Truncate case text to 2000 characters to avoid hitting API limits
            const truncatedText = input.text_content?.slice(0, 2000) || '';
            const truncationNote = input.text_content && input.text_content.length > 2000
              ? '\n[Case text truncated for analysis]'
              : '';

            // Include product context so Claude can assess relevance
            const productContext = account.products ? `Product: ${account.products}` : '';

            const prompt = `You are analyzing a self-storage software support case for a B2B SaaS company (EDGE or SiteLink products).

Determine if this is SYSTEMIC FRICTION (a recurring problem, product gap, or operational breakdown) or ROUTINE SUPPORT (a one-time how-to question, user error, or normal transactional request).

FRICTION examples: repeated billing errors, integration breaking, missing feature causing workarounds, data corruption, performance degrading over time, workflow that doesn't work as expected.
ROUTINE examples: "how do I run a report?", password reset, one-off user mistake, training question, simple how-to.

Return ONLY valid JSON, no other text:
{
  "is_friction": true or false,
  "summary": "one sentence describing the friction pattern (or null if not friction)",
  "theme_key": "one of: billing_and_payments, integration_failures, reporting_and_analytics, user_access_and_permissions, performance_and_reliability, api_and_data_issues, product_feature_gaps, data_migration, workflow_automation, onboarding_and_training",
  "severity": 1-5 (1=minor inconvenience, 3=impacts daily operations, 5=business-critical outage),
  "sentiment": "one of: frustrated, confused, neutral",
  "root_cause": "brief hypothesis about the systemic cause"
}

If is_friction is false, still return valid JSON but set summary to null, severity to 1, and pick the closest theme_key.

${productContext}
Case:
${truncatedText}${truncationNote}

Return ONLY the JSON object.`;

            try {
              // Use retry logic for API calls with 529 handling
              const anthropicResponse = await callAnthropicWithRetry('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': process.env.ANTHROPIC_API_KEY!,
                  'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                  model: 'claude-sonnet-4-20250514',
                  max_tokens: 400,
                  messages: [{ role: 'user', content: prompt }],
                }),
              });

              if (anthropicResponse.ok) {
                const data = await anthropicResponse.json();
                const text = data.content[0].text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
                const analysis = JSON.parse(text);

                // Only create friction cards for actual friction - skip routine support
                if (analysis.is_friction === true) {
                  frictionCards.push({
                    user_id: portfolio.user_id,
                    account_id: accountId,
                    raw_input_id: input.id,
                    is_friction: true,
                    summary: analysis.summary,
                    theme_key: analysis.theme_key || 'product_feature_gaps',
                    severity: analysis.severity || 3,
                    sentiment: analysis.sentiment || 'neutral',
                    root_cause_hypothesis: analysis.root_cause || 'Unknown',
                    evidence_snippets: [],
                    confidence_score: 0.8,
                    reasoning: 'Cron analysis',
                  });
                }
                // Note: we still mark the input as processed even for non-friction cases
                // so we don't re-analyze the same case on the next run
              }

              // Small delay between API calls to avoid rate limiting (200ms)
              await sleep(200);
            } catch (e) {
              console.error('Analysis error:', e);
            }
          }

          if (frictionCards.length > 0) {
            await supabase.from('friction_cards').insert(frictionCards);

            const inputIds = allInputsToAnalyze.map((i: any) => i.id);
            console.log(`Marking ${inputIds.length} inputs as processed:`, inputIds);

            const { error: updateError } = await supabase
              .from('raw_inputs')
              .update({ processed: true })
              .in('id', inputIds);

            if (updateError) {
              console.error('Error updating processed flag:', updateError);
            } else {
              console.log(`Successfully marked ${inputIds.length} inputs as processed`);
            }
          }

          // Get friction cards from last 90 days only (time-windowed so scores can decrease)
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
          const { data: allFrictionCards } = await supabase
            .from('friction_cards')
            .select('*')
            .eq('account_id', accountId)
            .eq('is_friction', true)
            .gte('created_at', ninetyDaysAgo);

          if (!allFrictionCards || allFrictionCards.length === 0) {
            console.log(`No friction cards found for ${account.name} after analysis`);
            continue;
          }

          console.log(`Calculating OFI from ${allFrictionCards.length} friction cards in last 90 days (${frictionCards.length} new)`);

          // Calculate OFI - gentler weights so scores are better distributed
          const highSeverityCount = allFrictionCards.filter(c => c.severity >= 4).length;
          const severityWeights: any = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };
          const weightedScore = allFrictionCards.reduce((sum, card) => sum + (severityWeights[card.severity] || 1), 0);

          // Normalize by case volume to get friction density
          const totalCases = casesData.records.length || 1;
          const frictionDensity = (allFrictionCards.length / totalCases) * 100;

          // Base score (logarithmic scale - coefficient 15 gives better distribution than 20)
          const baseScore = Math.log10(weightedScore + 1) * 15;

          // Friction density multiplier (0.5x to 1.5x - less aggressive than before)
          const densityMultiplier = Math.min(1.5, Math.max(0.5, frictionDensity / 5));

          // High severity boost (1.5 pts each, capped at +15)
          const highSeverityBoost = Math.min(15, highSeverityCount * 1.5);

          // Final OFI Score
          let ofiScore = Math.round(baseScore * densityMultiplier + highSeverityBoost);
          ofiScore = Math.min(100, Math.max(0, ofiScore));

          console.log(`OFI Calculation for ${account.name}:`, {
            frictionCards90d: allFrictionCards.length,
            newCards: frictionCards.length,
            highSeverityCount,
            totalCases,
            weightedScore,
            baseScore: baseScore.toFixed(1),
            frictionDensity: frictionDensity.toFixed(2) + '%',
            densityMultiplier: densityMultiplier.toFixed(2),
            highSeverityBoost,
            finalOfiScore: ofiScore
          });

          // Calculate top themes from windowed friction cards
          const themeMap = new Map<string, { count: number, totalSeverity: number }>();
          allFrictionCards.forEach(card => {
            const existing = themeMap.get(card.theme_key) || { count: 0, totalSeverity: 0 };
            existing.count++;
            existing.totalSeverity += card.severity;
            themeMap.set(card.theme_key, existing);
          });

          const topThemes = Array.from(themeMap.entries())
            .map(([theme_key, data]) => ({
              theme_key,
              count: data.count,
              avg_severity: data.totalSeverity / data.count
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Top 5 themes

          // Get yesterday's snapshot for trend comparison (not today's - we're creating that now)
          const { data: previousSnapshot } = await supabase
            .from('account_snapshots')
            .select('ofi_score, snapshot_date')
            .eq('account_id', accountId)
            .lt('snapshot_date', today)
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          let trendVsPriorPeriod = null;
          let trendDirection: 'improving' | 'stable' | 'worsening' = 'stable';

          if (previousSnapshot && previousSnapshot.ofi_score !== null) {
            trendVsPriorPeriod = ofiScore - previousSnapshot.ofi_score;

            // Determine trend direction (threshold: ±3 points - lower threshold catches more movement)
            if (trendVsPriorPeriod > 3) {
              trendDirection = 'worsening'; // Score going up = more friction = worse
            } else if (trendVsPriorPeriod < -3) {
              trendDirection = 'improving'; // Score going down = less friction = better
            } else {
              trendDirection = 'stable';
            }
          }

          console.log(`Creating snapshot for ${account.name}: OFI ${ofiScore}, ${allFrictionCards.length} total cards (${frictionCards.length} new), trend: ${trendDirection}`);

          const { error: snapshotError } = await supabase.from('account_snapshots').insert({
            account_id: accountId,
            snapshot_date: new Date().toISOString().split('T')[0],
            ofi_score: ofiScore,
            friction_card_count: allFrictionCards.length,
            high_severity_count: allFrictionCards.filter(c => c.severity >= 4).length,
            case_volume: casesData.records.length,
            top_themes: topThemes,
            score_breakdown: {
              base_score: Math.round(baseScore * 10) / 10,
              friction_density: Math.round(frictionDensity * 10) / 10,
              density_multiplier: Math.round(densityMultiplier * 100) / 100,
              high_severity_boost: highSeverityBoost,
              severity_weighted: weightedScore,
              card_count: allFrictionCards.length
            },
            trend_vs_prior_period: trendVsPriorPeriod,
            trend_direction: trendDirection
          }).select();

          if (snapshotError) {
            console.error(`Error creating snapshot for ${account.name}:`, snapshotError);
            results.push({ accountId, account: account.name, status: 'snapshot_error', error: snapshotError.message });
            accountsAnalyzed++; // Count snapshot errors too
          } else {
            console.log(`✓ Snapshot created successfully for ${account.name}`);

            // Generate alerts based on the analysis
            const alerts = [];

            // Alert 1: High Friction (OFI > 70)
            if (ofiScore >= 70) {
              alerts.push({
                user_id: portfolio.user_id,
                account_id: accountId,
                alert_type: 'high_friction',
                severity: 'high',
                title: `High Friction: ${account.name}`,
                message: `OFI score is ${ofiScore}, indicating significant customer friction. ${highSeverityCount} high-severity issues detected.`,
                evidence: {
                  ofi_score: ofiScore,
                  high_severity_count: highSeverityCount,
                  friction_card_count: allFrictionCards.length,
                  case_volume: casesData.records.length
                },
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
              });
            }

            // Alert 2: Critical Severity Issues (3+ high-severity cards)
            if (highSeverityCount >= 3) {
              alerts.push({
                user_id: portfolio.user_id,
                account_id: accountId,
                alert_type: 'critical_severity',
                severity: 'critical',
                title: `Critical Issues: ${account.name}`,
                message: `${highSeverityCount} critical severity issues detected in recent cases.`,
                evidence: {
                  high_severity_count: highSeverityCount,
                  ofi_score: ofiScore
                },
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
              });
            }

            // Alert 3: Trending Worse (OFI increasing by >10 points)
            if (trendDirection === 'worsening' && trendVsPriorPeriod && trendVsPriorPeriod > 10) {
              alerts.push({
                user_id: portfolio.user_id,
                account_id: accountId,
                alert_type: 'trending_worse',
                severity: 'medium',
                title: `Friction Increasing: ${account.name}`,
                message: `OFI score increased by ${Math.round(trendVsPriorPeriod)} points, from ${previousSnapshot?.ofi_score} to ${ofiScore}.`,
                evidence: {
                  ofi_score: ofiScore,
                  previous_ofi_score: previousSnapshot?.ofi_score,
                  change: trendVsPriorPeriod,
                  trend_direction: trendDirection
                },
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
              });
            }

            // Insert alerts if any were generated
            if (alerts.length > 0) {
              const { error: alertError } = await supabase.from('alerts').insert(alerts);
              if (alertError) {
                console.error(`Error creating alerts for ${account.name}:`, alertError);
              } else {
                console.log(`✓ Created ${alerts.length} alert(s) for ${account.name}`);
              }
            }

            results.push({ accountId, account: account.name, status: 'success', cases: casesData.records.length, analyzed: frictionCards.length, ofi: ofiScore });
            accountsAnalyzed++; // Increment counter after successful processing
          }
        } catch (error) {
          results.push({ accountId, status: 'error', error: String(error) });
          accountsAnalyzed++; // Count errors too to avoid infinite loops
        }
      }
    }

    console.log('=== Analysis Complete ===');
    console.log('Total accounts processed:', results.length);

    const successCount = results.filter(r => r.status === 'success').length;
    const noCasesCount = results.filter(r => r.status === 'no_cases').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    console.log(`Success: ${successCount}, Skipped: ${skippedCount}, No Cases: ${noCasesCount}, Failed: ${failedCount}`);
    console.log('Results summary:', results.map(r => ({ account: r.account, status: r.status, analyzed: r.analyzed, ofi: r.ofi })));

    return NextResponse.json({
      success: true,
      results,
      total: results.length,
      summary: {
        analyzed: successCount,
        skipped: skippedCount,
        no_cases: noCasesCount,
        failed: failedCount
      }
    });

  } catch (error) {
    console.error('=== Analysis Failed ===', error);
    return NextResponse.json({ error: 'Cron failed', details: String(error) }, { status: 500 });
  }
}
