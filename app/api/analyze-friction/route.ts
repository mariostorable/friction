import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
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

    const { data: rawInputs } = await supabase
      .from('raw_inputs')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .eq('processed', false)
      .order('created_at', { ascending: false })
      .limit(50);

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
    const errors: string[] = [];

    for (const input of rawInputs) {
      const prompt = `Analyze this support case and respond with ONLY valid JSON (no markdown):

${input.text_content}

Return a single JSON object with these fields:
- summary: Brief description of the issue (1 sentence)
- theme_key: Choose the MOST SPECIFIC theme that fits (avoid "other" unless truly necessary):
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
  * other: Only use if none of the above fit
- severity: 1-5 (1=minor inconvenience, 5=critical blocker)
- sentiment: frustrated, confused, angry, neutral, satisfied
- root_cause: Your hypothesis about the underlying cause
- evidence: Array of max 2 short quotes from the case that support your analysis`;

      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

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
          reasoning: 'Analyzed by Claude Sonnet',
          lifecycle_stage: null,
          is_new_theme: false,
        });
      } catch (e) {
        parseErrorCount++;
        console.error('Parse error for case:', input.id, e);
      }
    }

    console.log(`Analyzed ${frictionCards.length} cases successfully, ${parseErrorCount} parse errors, ${apiErrorCount} API errors`);

    if (frictionCards.length === 0) {
      return NextResponse.json({
        error: `No cases could be analyzed. Tried ${rawInputs.length} cases. API errors: ${apiErrorCount}, Parse errors: ${parseErrorCount}. ${errors[0] || 'Unknown error'}`,
        analyzed: 0,
        parse_errors: parseErrorCount,
        api_errors: apiErrorCount,
        sample_error: errors[0]
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

    await supabase
      .from('raw_inputs')
      .update({ processed: true })
      .in('id', rawInputs.map(r => r.id));

    return NextResponse.json({
      success: true,
      analyzed: insertedCards?.length || 0,
      message: `Created ${insertedCards?.length} friction cards`
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ 
      error: 'Analysis failed', 
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
