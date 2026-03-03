import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const VALID_THEMES = [
  'billing_confusion',
  'integration_failures',
  'ui_confusion',
  'performance_issues',
  'missing_features',
  'training_gaps',
  'support_response_time',
  'data_quality',
  'reporting_issues',
  'access_permissions',
  'configuration_problems',
  'notification_issues',
  'workflow_inefficiency',
  'mobile_issues',
  'documentation_gaps',
] as const;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * POST /api/reclassify-other-themes?limit=100
 * Finds friction cards with theme_key = 'other', re-classifies them
 * using Claude Haiku, then updates the database records.
 * Use limit param to process in chunks (default 100).
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, parseInt(searchParams.get('limit') || '100', 10));

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    }

    // Count total remaining before fetching the batch
    const { count: totalRemaining } = await supabase
      .from('friction_cards')
      .select('*', { count: 'exact', head: true })
      .eq('theme_key', 'other')
      .eq('is_friction', true);

    // Fetch a batch of friction cards with theme_key = 'other'
    const { data: otherCards, error: fetchError } = await supabase
      .from('friction_cards')
      .select('id, summary, root_cause_hypothesis, evidence_snippets, raw_input_id, account_id')
      .eq('theme_key', 'other')
      .eq('is_friction', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!otherCards || otherCards.length === 0) {
      return NextResponse.json({ message: 'No "other" cards to reclassify', updated: 0 });
    }

    console.log(`Found ${otherCards.length} cards with theme_key = 'other'`);

    // Fetch original case text for cards that have a raw_input_id
    const rawInputIds = otherCards
      .map(c => c.raw_input_id)
      .filter(Boolean) as string[];

    const rawInputMap = new Map<string, string>();
    if (rawInputIds.length > 0) {
      const { data: rawInputs } = await supabase
        .from('raw_inputs')
        .select('id, text_content')
        .in('id', rawInputIds);

      rawInputs?.forEach(r => rawInputMap.set(r.id, r.text_content || ''));
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    const BATCH_SIZE = 20;
    for (let i = 0; i < otherCards.length; i += BATCH_SIZE) {
      const batch = otherCards.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(otherCards.length / BATCH_SIZE)}...`);

      for (const card of batch) {
        // Build context: use raw case text if available, otherwise fall back to card summary + evidence
        const rawText = card.raw_input_id ? rawInputMap.get(card.raw_input_id) : null;
        const context = rawText
          ? rawText.slice(0, 1500)
          : [
              card.summary,
              card.root_cause_hypothesis,
              ...(card.evidence_snippets || []),
            ]
              .filter(Boolean)
              .join('\n');

        if (!context.trim()) {
          skipped++;
          continue;
        }

        const prompt = `You are classifying a customer friction issue into a specific category.

Context about the issue:
${context}

Choose the SINGLE most appropriate theme_key from this list:
- billing_confusion: Invoice, payment, pricing, subscription issues
- integration_failures: API issues, third-party app connections, data sync problems
- ui_confusion: Interface unclear, hard to find features, confusing workflow
- performance_issues: Slow load times, timeouts, system lag
- missing_features: Requested functionality doesn't exist
- training_gaps: User doesn't know how to use existing features
- support_response_time: Complaints about support speed or quality
- data_quality: Incorrect data, missing data, data inconsistencies
- reporting_issues: Problems with reports, exports, analytics
- access_permissions: User access, role permissions, login issues
- configuration_problems: Settings not working, setup issues
- notification_issues: Email alerts, in-app notifications problems
- workflow_inefficiency: Process is too complex or time-consuming
- mobile_issues: Mobile app or mobile web problems
- documentation_gaps: Help docs missing, outdated, or unclear

Respond with ONLY the theme_key string, nothing else. Pick the closest match — do not return "other".`;

        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY!,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 50,
              messages: [{ role: 'user', content: prompt }],
            }),
          });

          if (response.status === 429 || response.status === 529) {
            console.log(`Rate limited, waiting 5s...`);
            await sleep(5000);
            // Skip this card rather than blocking the whole job
            skipped++;
            continue;
          }

          if (!response.ok) {
            errors.push(`Card ${card.id}: API error ${response.status}`);
            skipped++;
            continue;
          }

          const data = await response.json();
          const rawTheme = data.content?.[0]?.text?.trim().toLowerCase().replace(/[^a-z_]/g, '');

          const newTheme = VALID_THEMES.find(t => t === rawTheme);
          if (!newTheme) {
            errors.push(`Card ${card.id}: Claude returned invalid theme "${rawTheme}"`);
            skipped++;
            continue;
          }

          const { error: updateError } = await supabase
            .from('friction_cards')
            .update({ theme_key: newTheme })
            .eq('id', card.id);

          if (updateError) {
            errors.push(`Card ${card.id}: update failed - ${updateError.message}`);
            skipped++;
          } else {
            updated++;
          }

          // 200ms delay to stay under rate limits (Haiku is fast)
          await sleep(200);
        } catch (err) {
          errors.push(`Card ${card.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          skipped++;
        }
      }
    }

    const remainingAfter = (totalRemaining || 0) - updated;
    console.log(`Reclassification complete: ${updated} updated, ${skipped} skipped, ~${remainingAfter} remaining`);

    return NextResponse.json({
      success: true,
      batch: otherCards.length,
      updated,
      skipped,
      remaining: Math.max(0, remainingAfter),
      done: remainingAfter <= 0,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('Reclassify error:', error);
    return NextResponse.json({
      error: 'Reclassification failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
