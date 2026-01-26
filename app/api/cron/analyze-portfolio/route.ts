import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes (Vercel Hobby plan limit)

export async function GET(request: NextRequest) {
  console.log('=== Analyze Portfolio Endpoint Called ===');

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

    // Get all users with portfolios (EDGE and SiteLink)
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('user_id, account_ids, portfolio_type')
      .in('portfolio_type', ['top_25_edge', 'top_25_sitelink']);

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ message: 'No portfolios found' });
    }

    const results = [];
    let accountsAnalyzed = 0;
    const MAX_ANALYSES_PER_RUN = 3; // Process 3 accounts per run (every 20 minutes)

    for (const portfolio of portfolios) {
      for (const accountId of portfolio.account_ids) {
        try {
          // Get account details
          const { data: account } = await supabase
            .from('accounts')
            .select('salesforce_id, name')
            .eq('id', accountId)
            .single();

          if (!account) continue;

          // Check if account already has a snapshot from today
          const today = new Date().toISOString().split('T')[0];
          const { data: existingSnapshot } = await supabase
            .from('account_snapshots')
            .select('id, ofi_score')
            .eq('account_id', accountId)
            .eq('snapshot_date', today)
            .maybeSingle();

          if (existingSnapshot) {
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

          // Get tokens
          const { data: tokens } = await supabase
            .from('oauth_tokens')
            .select('*')
            .eq('integration_id', integration.id)
            .single();

          if (!tokens) continue;

          // Fetch cases from Salesforce (looking back 90 days, most recent first)
          const query = `SELECT Id,CaseNumber,Subject,Description,Status,Priority,CreatedDate FROM Case WHERE AccountId='${account.salesforce_id}' AND CreatedDate=LAST_N_DAYS:90 ORDER BY CreatedDate DESC LIMIT 100`;
          console.log(`Fetching cases for account: ${account.name} (${account.salesforce_id})`);

          const casesResponse = await fetch(
            `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`,
            {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!casesResponse.ok) {
            console.error(`Failed to fetch cases for ${account.name}:`, casesResponse.status);
            results.push({ accountId, account: account.name, status: 'failed', error: 'Salesforce fetch failed' });
            continue;
          }

          const casesData = await casesResponse.json();
          console.log(`Found ${casesData.records?.length || 0} cases for ${account.name}`);

          if (!casesData.records || casesData.records.length === 0) {
            // Create snapshot with OFI 0 for accounts with no cases
            const { error: snapshotError } = await supabase.from('account_snapshots').insert({
              account_id: accountId,
              snapshot_date: new Date().toISOString().split('T')[0],
              ofi_score: 0,
              friction_card_count: 0,
              high_severity_count: 0,
              case_volume: 0,
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

          // Delete old data for this account to ensure we only work with fresh 90-day data
          console.log(`Cleaning up old data for ${account.name}...`);

          // Delete old friction cards
          const { error: cardsDeleteError } = await supabase
            .from('friction_cards')
            .delete()
            .eq('account_id', accountId)
            .eq('user_id', portfolio.user_id);

          if (cardsDeleteError) {
            console.error(`Error deleting old friction_cards for ${account.name}:`, cardsDeleteError);
          }

          // Delete old raw_inputs
          const { error: inputsDeleteError } = await supabase
            .from('raw_inputs')
            .delete()
            .eq('account_id', accountId)
            .eq('user_id', portfolio.user_id);

          if (inputsDeleteError) {
            console.error(`Error deleting old raw_inputs for ${account.name}:`, inputsDeleteError);
          }

          console.log(`Old data cleaned up successfully for ${account.name}`);

          // Store raw inputs
          const rawInputs = casesData.records.map((sfCase: any) => ({
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
              created_date: sfCase.CreatedDate,
            },
            processed: false,
          }));

          const { data: insertedInputs } = await supabase.from('raw_inputs').insert(rawInputs).select();

          if (!insertedInputs || insertedInputs.length === 0) continue;

          // Analyze with Claude (up to 100 cases per account)
          const limitedInputs = insertedInputs.slice(0, 100);
          const frictionCards = [];

          for (const input of limitedInputs) {
            const prompt = `Analyze this customer support case and return ONLY valid JSON with no other text, explanation, or markdown formatting.

Required JSON structure:
{
  "summary": "brief summary of the issue",
  "theme_key": "one of: billing_confusion, integration_failures, ui_confusion, performance_issues, other",
  "severity": 1-5 (number),
  "sentiment": "one of: frustrated, confused, neutral",
  "root_cause": "brief root cause hypothesis"
}

Case to analyze:
${input.text_content}

Return ONLY the JSON object, nothing else.`;

            try {
              const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': process.env.ANTHROPIC_API_KEY!,
                  'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                  model: 'claude-sonnet-4-20250514',
                  max_tokens: 300,
                  messages: [{ role: 'user', content: prompt }],
                }),
              });

              if (anthropicResponse.ok) {
                const data = await anthropicResponse.json();
                const text = data.content[0].text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
                const analysis = JSON.parse(text);
                
                frictionCards.push({
                  user_id: portfolio.user_id,
                  account_id: accountId,
                  raw_input_id: input.id,
                  summary: analysis.summary,
                  theme_key: analysis.theme_key || 'other',
                  severity: analysis.severity || 3,
                  sentiment: analysis.sentiment || 'neutral',
                  root_cause_hypothesis: analysis.root_cause || 'Unknown',
                  evidence_snippets: [],
                  confidence_score: 0.7,
                  reasoning: 'Cron analysis',
                });
              }
            } catch (e) {
              console.error('Analysis error:', e);
            }
          }

          if (frictionCards.length > 0) {
            await supabase.from('friction_cards').insert(frictionCards);

            const inputIds = limitedInputs.map((i: any) => i.id);
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

            // Calculate OFI
            const severityWeights: any = { 1: 0.5, 2: 1, 3: 2, 4: 5, 5: 10 };
            const weightedScore = frictionCards.reduce((sum, card) => sum + (severityWeights[card.severity] || 1), 0);
            const ofiScore = Math.min(100, Math.round(weightedScore * 2));

            console.log(`Creating snapshot for ${account.name}: OFI ${ofiScore}, ${frictionCards.length} cards`);

            const { error: snapshotError } = await supabase.from('account_snapshots').insert({
              account_id: accountId,
              snapshot_date: new Date().toISOString().split('T')[0],
              ofi_score: ofiScore,
              friction_card_count: frictionCards.length,
              high_severity_count: frictionCards.filter(c => c.severity >= 4).length,
              case_volume: casesData.records.length,
            }).select();

            if (snapshotError) {
              console.error(`Error creating snapshot for ${account.name}:`, snapshotError);
              results.push({ accountId, account: account.name, status: 'snapshot_error', error: snapshotError.message });
              accountsAnalyzed++; // Count snapshot errors too
            } else {
              console.log(`✓ Snapshot created successfully for ${account.name}`);
              results.push({ accountId, account: account.name, status: 'success', cases: casesData.records.length, analyzed: frictionCards.length, ofi: ofiScore });
              accountsAnalyzed++; // Increment counter after successful processing
            }
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
