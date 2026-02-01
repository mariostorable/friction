import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const maxDuration = 300; // 5 minutes to handle up to 50 cases

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    console.log('Analyzing friction for account:', accountId);

    // Check if API key is present
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        error: 'Claude API key not configured. Please set ANTHROPIC_API_KEY environment variable.',
        analyzed: 0
      }, { status: 500 });
    }

    // Fetch unprocessed cases in batches of 20 to avoid Vercel timeouts (10s limit on free tier)
    const BATCH_SIZE = 20;
    const { data: rawInputs } = await supabase
      .from('raw_inputs')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .eq('processed', false)
      .order('created_at', { ascending: false })
      .limit(BATCH_SIZE);

    console.log('Found raw inputs:', rawInputs?.length || 0);

    if (!rawInputs || rawInputs.length === 0) {
      return NextResponse.json({
        error: 'No unprocessed cases found. Make sure you synced cases first.',
        analyzed: 0
      }, { status: 404 });
    }

    const frictionCards = [];
    let parseErrorCount = 0;
    let apiErrorCount = 0;
    let nonFrictionCount = 0;
    const errors: string[] = [];

    // Helper function: sleep for rate limiting
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

          // If 529 (overloaded) or 429 (rate limit), retry with exponential backoff
          if (response.status === 529 || response.status === 429) {
            const waitTime = Math.min(3000 * Math.pow(2, attempt), 60000); // Start at 3s, max 60s
            console.log(`API busy (${response.status}), waiting ${waitTime/1000}s before retry ${attempt + 1}/${maxRetries}...`);
            await sleep(waitTime);
            continue;
          }

          return response;
        } catch (error) {
          const waitTime = Math.min(3000 * Math.pow(2, attempt), 60000);
          console.error(`Request error on attempt ${attempt + 1}:`, error);
          if (attempt === maxRetries - 1) {
            throw new Error(`API overloaded after ${maxRetries} retries. The service is experiencing high demand. Please wait 2-3 minutes and try again.`);
          }
          await sleep(waitTime);
        }
      }
      throw new Error(`API overloaded after ${maxRetries} retries. Please try again in a few minutes.`);
    };

    for (let i = 0; i < rawInputs.length; i++) {
      const input = rawInputs[i];

      // Log progress every 10 cases
      if (i % 10 === 0) {
        console.log(`Processing case ${i + 1}/${rawInputs.length}...`);
      }

      // Truncate case text to 2000 characters to avoid hitting API limits
      const truncatedText = input.text_content?.slice(0, 2000) || '';
      const truncationNote = input.text_content && input.text_content.length > 2000
        ? '\n[Case text truncated for analysis]'
        : '';

      const prompt = `Analyze this support case and respond with ONLY valid JSON (no markdown):

${truncatedText}${truncationNote}

Return a single JSON object with these fields:

FIRST, determine if this is actual friction or routine support:
- is_friction: true/false
  * TRUE = User is blocked, confused, frustrated, experiencing errors, or encountering product limitations
  * FALSE = Routine questions, transactional requests (change email/password), positive feedback, simple how-to questions that are easily answered, or feature requests without clear pain

If is_friction is FALSE, stop here and return: {"is_friction": false, "reason": "brief explanation"}

If is_friction is TRUE, continue with:
- summary: Brief description of the issue (1 sentence)
- theme_key: Choose the MOST SPECIFIC theme. "other" should be under 10% of cases:
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

      // Use retry logic for API calls
      const anthropicResponse = await callAnthropicWithRetry(prompt);

      if (!anthropicResponse.ok) {
        apiErrorCount++;
        const errorData = await anthropicResponse.json().catch(() => ({}));
        const errorMsg = `API Error ${anthropicResponse.status}: ${errorData.error?.message || JSON.stringify(errorData)}`;
        console.error('Anthropic API error:', errorMsg);
        errors.push(errorMsg);
        if (apiErrorCount === 1) {
          // Return immediately on first API error to help diagnose
          return NextResponse.json({
            error: `Claude API call failed: ${errorMsg}`,
            analyzed: 0,
            api_errors: apiErrorCount
          }, { status: 500 });
        }
        continue;
      }

      const anthropicData = await anthropicResponse.json();
      let responseText = anthropicData.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const analysis = JSON.parse(responseText);

        // Skip if not actual friction
        if (analysis.is_friction === false) {
          nonFrictionCount++;
          console.log(`Skipping non-friction case ${input.id}: ${analysis.reason || 'Not friction'}`);
          // Still count as processed but don't create a friction card
          await sleep(300);
          continue;
        }

        frictionCards.push({
          user_id: user.id,
          account_id: accountId,
          raw_input_id: input.id,
          summary: analysis.summary,
          theme_key: analysis.theme_key || 'other',
          product_area: null,
          severity: Math.min(5, Math.max(1, analysis.severity)),
          sentiment: analysis.sentiment || 'neutral',
          root_cause_hypothesis: analysis.root_cause || 'Unknown',
          evidence_snippets: analysis.evidence || [],
          confidence_score: 0.8,
          reasoning: 'Analyzed by Claude Sonnet 4.5',
          lifecycle_stage: null,
          is_new_theme: false,
        });

        // Delay between API calls to avoid rate limiting (300ms = ~3 requests/second)
        await sleep(300);
      } catch (e) {
        parseErrorCount++;
        console.error('Parse error for case:', input.id, e);
      }
    }

    console.log(`Analyzed ${frictionCards.length} friction cases, ${nonFrictionCount} non-friction filtered, ${parseErrorCount} parse errors, ${apiErrorCount} API errors`);

    // IMPORTANT: Mark ALL cases as processed, even if they failed
    // This prevents cases from getting stuck in an infinite loop
    const inputIds = rawInputs.map(r => r.id);
    console.log(`Marking ${inputIds.length} inputs as processed (including ${parseErrorCount + apiErrorCount} failed):`, inputIds);

    // Use admin client to bypass RLS and ensure the update succeeds
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: updateError } = await adminClient
      .from('raw_inputs')
      .update({ processed: true })
      .in('id', inputIds);

    if (updateError) {
      console.error('CRITICAL: Failed to mark inputs as processed:', updateError);
    } else {
      console.log(`Successfully marked ${inputIds.length} inputs as processed`);
    }

    // If no cards were created, return error but cases are already marked processed
    if (frictionCards.length === 0) {
      // If all cases were non-friction, that's actually success
      if (nonFrictionCount === rawInputs.length) {
        return NextResponse.json({
          success: true,
          analyzed: 0,
          filtered: nonFrictionCount,
          remaining: 0,
          message: `All ${nonFrictionCount} cases were routine support (not friction). Cases marked as processed.`
        });
      }

      return NextResponse.json({
        error: `No friction cases found. Tried ${rawInputs.length} cases. Non-friction filtered: ${nonFrictionCount}, API errors: ${apiErrorCount}, Parse errors: ${parseErrorCount}. ${errors[0] || 'Unknown error'}`,
        analyzed: 0,
        filtered: nonFrictionCount,
        parse_errors: parseErrorCount,
        api_errors: apiErrorCount,
        sample_error: errors[0],
        marked_processed: inputIds.length
      }, { status: 500 });
    }

    const { data: insertedCards, error: cardError } = await supabase
      .from('friction_cards')
      .insert(frictionCards)
      .select();

    if (cardError) {
      console.error('Card insert error:', JSON.stringify(cardError));
      return NextResponse.json({
        error: 'Failed to create friction cards',
        details: cardError.message,
        code: cardError.code
      }, { status: 500 });
    }

    // Check if there are more unprocessed cases remaining
    const { count: remainingCount } = await supabase
      .from('raw_inputs')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .eq('processed', false);

    const message = remainingCount && remainingCount > 0
      ? `Created ${insertedCards?.length} friction cards (${nonFrictionCount} non-friction cases filtered). ${remainingCount} more cases remaining - click Analyze again to continue.`
      : `Created ${insertedCards?.length} friction cards (${nonFrictionCount} non-friction cases filtered). All cases processed!`;

    return NextResponse.json({
      success: true,
      analyzed: insertedCards?.length || 0,
      filtered: nonFrictionCount,
      remaining: remainingCount || 0,
      message
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ 
      error: 'Analysis failed', 
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
