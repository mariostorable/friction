import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function bulkAnalyzeFriction() {
  const userId = process.argv[2] || 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== BULK ANALYZE FRICTION ===\n');
  console.log(`User ID: ${userId}\n`);

  // Check for Claude API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('✗ ANTHROPIC_API_KEY not set in environment');
    return;
  }

  // Get all portfolio accounts
  const { data: portfolios } = await supabaseAdmin
    .from('portfolios')
    .select('account_ids')
    .eq('user_id', userId)
    .in('portfolio_type', ['top_25_edge', 'top_25_marine', 'top_25_sitelink']);

  if (!portfolios || portfolios.length === 0) {
    console.error('✗ No portfolios found');
    return;
  }

  const accountIds = new Set<string>();
  portfolios.forEach(p => p.account_ids.forEach((id: string) => accountIds.add(id)));

  // Get accounts with unprocessed raw_inputs
  const { data: accountsWithUnprocessed } = await supabaseAdmin
    .from('raw_inputs')
    .select('account_id, accounts!inner(id, name)')
    .eq('user_id', userId)
    .eq('processed', false)
    .in('account_id', Array.from(accountIds));

  if (!accountsWithUnprocessed || accountsWithUnprocessed.length === 0) {
    console.log('✓ All accounts are fully analyzed! No unprocessed cases remaining.\n');
    return;
  }

  // Group by account and count unprocessed cases
  const accountMap = new Map<string, { name: string; count: number }>();
  accountsWithUnprocessed.forEach((row: any) => {
    const accountId = row.account_id;
    const accountName = row.accounts.name;

    if (!accountMap.has(accountId)) {
      accountMap.set(accountId, { name: accountName, count: 0 });
    }
    accountMap.get(accountId)!.count++;
  });

  const accountsToAnalyze = Array.from(accountMap.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    unprocessedCount: data.count
  })).sort((a, b) => b.unprocessedCount - a.unprocessedCount);

  console.log(`Found ${accountsToAnalyze.length} accounts with unprocessed cases:\n`);
  accountsToAnalyze.forEach(acc => {
    console.log(`  - ${acc.name}: ${acc.unprocessedCount} cases`);
  });
  console.log(`\nTotal unprocessed cases: ${accountsWithUnprocessed.length}\n`);
  console.log('Starting analysis (batches of 50 cases per account)...\n');

  let totalAnalyzed = 0;
  let accountsAnalyzed = 0;
  let errorCount = 0;
  const errors: string[] = [];

  const BATCH_SIZE = 50;
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper function: retry with exponential backoff
  const callAnthropicWithRetry = async (prompt: string, maxRetries = 5) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (response.status === 529 || response.status === 429) {
          const waitTime = Math.min(3000 * Math.pow(2, attempt), 60000);
          console.log(`    API busy (${response.status}), waiting ${waitTime/1000}s...`);
          await sleep(waitTime);
          continue;
        }

        return response;
      } catch (error) {
        const waitTime = Math.min(3000 * Math.pow(2, attempt), 60000);
        if (attempt === maxRetries - 1) {
          throw new Error(`API overloaded after ${maxRetries} retries`);
        }
        await sleep(waitTime);
      }
    }
    throw new Error(`API overloaded after ${maxRetries} retries`);
  };

  for (let i = 0; i < accountsToAnalyze.length; i++) {
    const account = accountsToAnalyze[i];
    const progress = `[${i + 1}/${accountsToAnalyze.length}]`;

    console.log(`${progress} ${account.name} (${account.unprocessedCount} cases)...`);

    try {
      // Process account in batches until all cases are analyzed
      let remainingCases = account.unprocessedCount;
      let batchNum = 0;

      while (remainingCases > 0) {
        batchNum++;

        // Fetch batch of unprocessed cases
        const { data: rawInputs } = await supabaseAdmin
          .from('raw_inputs')
          .select('*')
          .eq('account_id', account.id)
          .eq('user_id', userId)
          .eq('processed', false)
          .order('created_at', { ascending: false })
          .limit(BATCH_SIZE);

        if (!rawInputs || rawInputs.length === 0) {
          break;
        }

        console.log(`  Batch ${batchNum}: Processing ${rawInputs.length} cases...`);

        const frictionCards = [];
        let parseErrorCount = 0;
        let apiErrorCount = 0;
        let nonFrictionCount = 0;

        // Analyze each case
        for (let j = 0; j < rawInputs.length; j++) {
          const input = rawInputs[j];

          if (j > 0 && j % 10 === 0) {
            console.log(`    Progress: ${j}/${rawInputs.length} cases...`);
          }

          const truncatedText = input.text_content?.slice(0, 2000) || '';
          const truncationNote = input.text_content && input.text_content.length > 2000
            ? '\n[Case text truncated for analysis]'
            : '';

          const prompt = `Analyze this support case and respond with ONLY valid JSON (no markdown):

${truncatedText}${truncationNote}

Return a single JSON object with these fields:

FIRST, determine if this is actual FRICTION or routine support:

is_friction: true/false - BE STRICT! Only mark as TRUE if it's a systemic product/UX problem.

TRUE = Product Friction (systemic issues requiring engineering/design fixes):
  - Bugs, errors, system failures, crashes
  - Features that don't work as expected or are broken
  - Confusing UI/UX that blocks user workflows
  - Performance problems (slowness, timeouts, lag)
  - Integration failures, API errors, sync issues
  - Missing critical functionality that blocks workflows
  - Data quality issues caused by the system
  - Billing system problems or payment processing errors

FALSE = Normal Support (routine requests that don't need product fixes):
  - Auto-replies, out-of-office messages
  - Transactional requests: "change my email", "update address", "reset password"
  - Onboarding tasks: "add new location", "setup new user", "configure settings"
  - How-to questions easily answered by documentation
  - Feature requests without demonstrated pain/blocking issues
  - Positive feedback or thank-you messages
  - Account cancellations or service changes
  - Questions about how existing features work (unless user is confused because UI is unclear)

If is_friction is FALSE, return: {"is_friction": false, "summary": "brief 1-sentence description", "reason": "why it's not friction"}

If is_friction is TRUE, continue with full analysis:
- summary: Brief description of the issue (1 sentence)
- theme_key: Choose the MOST SPECIFIC theme. "other" should be RARE:
  * billing_confusion: Invoice, payment, pricing, subscription issues
  * integration_failures: API issues, third-party app connections, data sync problems
  * ui_confusion: Interface unclear, hard to find features, confusing workflow
  * performance_issues: Slow load times, timeouts, system lag
  * missing_features: Requested functionality doesn't exist
  * training_gaps: User doesn't know how to use existing features
  * support_response_time: Complaints about support speed or quality
  * data_quality: Incorrect data, missing data, data inconsistencies
  * reporting_issues: Problems with reports, exports, analytics
  * access_permissions: User access, role permissions, login issues
  * configuration_problems: Settings not working, setup issues
  * notification_issues: Email alerts, in-app notifications problems
  * workflow_inefficiency: Process is too complex or time-consuming
  * mobile_issues: Mobile app or mobile web problems
  * documentation_gaps: Help docs missing, outdated, or unclear
  * other: ONLY if absolutely none of the above apply (should be rare)
- severity: 1-5 (1=minor inconvenience, 5=critical blocker)
- sentiment: frustrated, confused, angry, neutral, satisfied
- root_cause: Your hypothesis about the underlying cause
- evidence: Array of max 2 short quotes from the case that support your analysis`;

          try {
            const anthropicResponse = await callAnthropicWithRetry(prompt);

            if (!anthropicResponse.ok) {
              apiErrorCount++;
              continue;
            }

            const anthropicData = await anthropicResponse.json();
            let responseText = anthropicData.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            const analysis = JSON.parse(responseText);
            const isFriction = analysis.is_friction !== false;

            if (!isFriction) {
              nonFrictionCount++;
            }

            frictionCards.push({
              user_id: userId,
              account_id: account.id,
              raw_input_id: input.id,
              summary: analysis.summary || 'Support request',
              theme_key: isFriction ? (analysis.theme_key || 'other') : 'normal_support',
              product_area: null,
              severity: isFriction ? Math.min(5, Math.max(1, analysis.severity || 1)) : 1,
              sentiment: analysis.sentiment || 'neutral',
              root_cause_hypothesis: isFriction ? (analysis.root_cause || 'Unknown') : (analysis.reason || 'Normal support request'),
              evidence_snippets: analysis.evidence || [],
              confidence_score: 0.8,
              reasoning: isFriction ? 'Analyzed by Claude Sonnet 4.5' : `Non-friction: ${analysis.reason || 'Normal support'}`,
              lifecycle_stage: null,
              is_new_theme: false,
              is_friction: isFriction,
            });

            // Rate limit: 300ms between API calls
            await sleep(300);

          } catch (e) {
            parseErrorCount++;
          }
        }

        // Mark cases as processed
        const inputIds = rawInputs.map(r => r.id);
        const { error: updateError } = await supabaseAdmin
          .from('raw_inputs')
          .update({ processed: true })
          .in('id', inputIds);

        if (updateError) {
          console.error(`    ✗ Failed to mark inputs as processed:`, updateError.message);
        }

        // Insert friction cards
        if (frictionCards.length > 0) {
          const { error: cardError } = await supabaseAdmin
            .from('friction_cards')
            .insert(frictionCards);

          if (cardError) {
            console.error(`    ✗ Failed to insert friction cards:`, cardError.message);
            errorCount++;
            errors.push(`${account.name} batch ${batchNum}: ${cardError.message}`);
          } else {
            const frictionCount = frictionCards.length - nonFrictionCount;
            console.log(`  ✓ Batch ${batchNum}: ${frictionCount} friction, ${nonFrictionCount} support (${parseErrorCount + apiErrorCount} errors)`);
            totalAnalyzed += frictionCards.length;
          }
        }

        remainingCases -= rawInputs.length;
      }

      accountsAnalyzed++;
      console.log(`  ✓ ${account.name} complete\n`);

    } catch (error) {
      console.error(`  ✗ Error:`, error instanceof Error ? error.message : error);
      errorCount++;
      errors.push(`${account.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n=== BULK ANALYSIS COMPLETE ===');
  console.log(`  Accounts analyzed: ${accountsAnalyzed}/${accountsToAnalyze.length}`);
  console.log(`  Total cases analyzed: ${totalAnalyzed}`);
  console.log(`  Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log(`\n❌ Errors encountered:`);
    errors.slice(0, 5).forEach(err => console.log(`  - ${err}`));
    if (errors.length > 5) {
      console.log(`  ... and ${errors.length - 5} more`);
    }
  }

  console.log(`\nNext step: Run backfill to link Jira tickets`);
  console.log(`  npx tsx scripts/backfill-salesforce-links.ts ${userId}\n`);
}

bulkAnalyzeFriction();
