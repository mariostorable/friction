import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get all portfolios
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('user_id, account_ids')
      .eq('portfolio_type', 'top_25')

    if (!portfolios || portfolios.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No portfolios found' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    const results = []
    let accountsAnalyzed = 0
    const MAX_ANALYSES_PER_RUN = 3

    for (const portfolio of portfolios) {
      for (const accountId of portfolio.account_ids) {
        try {
          // Get account details
          const { data: account } = await supabase
            .from('accounts')
            .select('salesforce_id, name')
            .eq('id', accountId)
            .single()

          if (!account) continue

          // Check if already analyzed today
          const today = new Date().toISOString().split('T')[0]
          const { data: existingSnapshot } = await supabase
            .from('account_snapshots')
            .select('id, ofi_score')
            .eq('account_id', accountId)
            .eq('snapshot_date', today)
            .maybeSingle()

          if (existingSnapshot) {
            console.log(`Skipping ${account.name} - already analyzed today`)
            results.push({
              accountId,
              account: account.name,
              status: 'skipped',
              ofi: existingSnapshot.ofi_score,
              reason: 'Already analyzed today'
            })
            continue
          }

          // Stop after max accounts
          if (accountsAnalyzed >= MAX_ANALYSES_PER_RUN) {
            console.log(`Reached max analysis limit (${MAX_ANALYSES_PER_RUN})`)
            break
          }

          // Get integration
          const { data: integration } = await supabase
            .from('integrations')
            .select('*')
            .eq('user_id', portfolio.user_id)
            .eq('integration_type', 'salesforce')
            .single()

          if (!integration) continue

          // Get tokens
          const { data: tokens } = await supabase
            .from('oauth_tokens')
            .select('*')
            .eq('integration_id', integration.id)
            .single()

          if (!tokens) continue

          // Fetch cases from Salesforce
          const query = `SELECT Id,CaseNumber,Subject,Description,Status,Priority,CreatedDate FROM Case WHERE AccountId='${account.salesforce_id}' AND CreatedDate=LAST_N_DAYS:90 ORDER BY CreatedDate DESC LIMIT 100`

          const casesResponse = await fetch(
            `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`,
            {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json',
              },
            }
          )

          if (!casesResponse.ok) {
            console.error(`Failed to fetch cases for ${account.name}`)
            results.push({ accountId, account: account.name, status: 'failed', error: 'Salesforce fetch failed' })
            continue
          }

          const casesData = await casesResponse.json()
          console.log(`Found ${casesData.records?.length || 0} cases for ${account.name}`)

          if (!casesData.records || casesData.records.length === 0) {
            // Create snapshot with OFI 0 for accounts with no cases
            await supabase.from('account_snapshots').insert({
              account_id: accountId,
              snapshot_date: today,
              ofi_score: 0,
              friction_card_count: 0,
              high_severity_count: 0,
              case_volume: 0,
            })

            results.push({ accountId, account: account.name, status: 'no_cases', cases: 0, ofi: 0 })
            accountsAnalyzed++
            continue
          }

          // Clean up old data
          await supabase.from('friction_cards').delete().eq('account_id', accountId).eq('user_id', portfolio.user_id)
          await supabase.from('raw_inputs').delete().eq('account_id', accountId).eq('user_id', portfolio.user_id)

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
          }))

          const { data: insertedInputs } = await supabase.from('raw_inputs').insert(rawInputs).select()
          if (!insertedInputs || insertedInputs.length === 0) continue

          // Analyze with Claude
          const frictionCards = []
          for (const input of insertedInputs.slice(0, 100)) {
            const prompt = `Analyze this customer support case and return ONLY valid JSON with no other text.

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

Return ONLY the JSON object, nothing else.`

            try {
              const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
                  'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                  model: 'claude-sonnet-4-20250514',
                  max_tokens: 300,
                  messages: [{ role: 'user', content: prompt }],
                }),
              })

              if (anthropicResponse.ok) {
                const data = await anthropicResponse.json()
                const text = data.content[0].text.replace(/```json\n?/g, '').replace(/```/g, '').trim()
                const analysis = JSON.parse(text)

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
                })
              }
            } catch (e) {
              console.error('Analysis error:', e)
            }
          }

          if (frictionCards.length > 0) {
            await supabase.from('friction_cards').insert(frictionCards)

            const inputIds = insertedInputs.map((i: any) => i.id)
            await supabase.from('raw_inputs').update({ processed: true }).in('id', inputIds)

            // Calculate OFI
            const severityWeights: any = { 1: 0.5, 2: 1, 3: 2, 4: 5, 5: 10 }
            const weightedScore = frictionCards.reduce((sum, card) => sum + (severityWeights[card.severity] || 1), 0)
            const ofiScore = Math.min(100, Math.round(weightedScore * 2))

            await supabase.from('account_snapshots').insert({
              account_id: accountId,
              snapshot_date: today,
              ofi_score: ofiScore,
              friction_card_count: frictionCards.length,
              high_severity_count: frictionCards.filter(c => c.severity >= 4).length,
              case_volume: casesData.records.length,
            })

            results.push({
              accountId,
              account: account.name,
              status: 'success',
              cases: casesData.records.length,
              analyzed: frictionCards.length,
              ofi: ofiScore
            })
            accountsAnalyzed++
          }
        } catch (error) {
          results.push({ accountId, status: 'error', error: String(error) })
          accountsAnalyzed++
        }
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    const noCasesCount = results.filter(r => r.status === 'no_cases').length
    const failedCount = results.filter(r => r.status === 'failed').length
    const skippedCount = results.filter(r => r.status === 'skipped').length

    return new Response(
      JSON.stringify({
        success: true,
        results,
        total: results.length,
        summary: {
          analyzed: successCount,
          skipped: skippedCount,
          no_cases: noCasesCount,
          failed: failedCount
        }
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Cron failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
