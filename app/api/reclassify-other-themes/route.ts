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

type ValidTheme = typeof VALID_THEMES[number];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * POST /api/reclassify-other-themes?limit=200
 * Classifies friction cards with theme_key='other' in batches of 25 per Claude call.
 * Much faster than one-at-a-time: 200 cards = ~8 API calls instead of 200.
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(300, parseInt(searchParams.get('limit') || '200', 10));
    const CLAUDE_BATCH = 25; // cards per single Claude API call

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    }

    // Count total remaining
    const { count: totalRemaining } = await supabase
      .from('friction_cards')
      .select('*', { count: 'exact', head: true })
      .eq('theme_key', 'other')
      .eq('is_friction', true);

    if (!totalRemaining || totalRemaining === 0) {
      return NextResponse.json({ message: 'No "other" cards to reclassify', updated: 0, remaining: 0, done: true });
    }

    // Fetch a batch of cards
    const { data: otherCards, error: fetchError } = await supabase
      .from('friction_cards')
      .select('id, summary, root_cause_hypothesis, evidence_snippets, raw_input_id')
      .eq('theme_key', 'other')
      .eq('is_friction', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!otherCards || otherCards.length === 0) {
      return NextResponse.json({ message: 'No cards found', updated: 0, remaining: 0, done: true });
    }

    console.log(`Processing ${otherCards.length} of ${totalRemaining} remaining 'other' cards...`);

    // Fetch raw input text in bulk (one query)
    const rawInputIds = otherCards.map(c => c.raw_input_id).filter(Boolean) as string[];
    const rawInputMap = new Map<string, string>();
    if (rawInputIds.length > 0) {
      const { data: rawInputs } = await supabase
        .from('raw_inputs')
        .select('id, text_content')
        .in('id', rawInputIds);
      rawInputs?.forEach(r => rawInputMap.set(r.id, (r.text_content || '').slice(0, 400)));
    }

    // Build context for each card (short snippets to keep batch prompt small)
    const cardContexts = otherCards.map(card => {
      const rawText = card.raw_input_id ? rawInputMap.get(card.raw_input_id) : null;
      const text = rawText || [card.summary, card.root_cause_hypothesis].filter(Boolean).join(' | ');
      return { id: card.id, text: text.slice(0, 400) };
    });

    let updated = 0;
    let skipped = 0;

    // Process in batches of CLAUDE_BATCH per API call
    for (let i = 0; i < cardContexts.length; i += CLAUDE_BATCH) {
      const batch = cardContexts.slice(i, i + CLAUDE_BATCH);

      const itemsText = batch
        .map((c, idx) => `${idx + 1}. ${c.text}`)
        .join('\n\n');

      const prompt = `Classify each customer friction issue below into the best theme.

Themes:
billing_confusion, integration_failures, ui_confusion, performance_issues, missing_features, training_gaps, support_response_time, data_quality, reporting_issues, access_permissions, configuration_problems, notification_issues, workflow_inefficiency, mobile_issues, documentation_gaps

Issues:
${itemsText}

Respond with ONLY a JSON array of strings, one theme per issue, in order. Example: ["ui_confusion","billing_confusion","data_quality"]
No other text.`;

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
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (response.status === 429 || response.status === 529) {
          console.log('Rate limited, waiting 5s...');
          await sleep(5000);
          skipped += batch.length;
          continue;
        }

        if (!response.ok) {
          console.error(`API error ${response.status} for batch ${i}`);
          skipped += batch.length;
          continue;
        }

        const data = await response.json();
        const rawText = data.content?.[0]?.text?.trim() || '';

        // Parse JSON array response
        const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        let themes: string[];
        try {
          themes = JSON.parse(cleaned);
        } catch {
          console.error(`Failed to parse Claude response: ${rawText}`);
          skipped += batch.length;
          continue;
        }

        // Update each card in the batch
        for (let j = 0; j < batch.length; j++) {
          const card = batch[j];
          const rawTheme = (themes[j] || '').trim().toLowerCase();
          const newTheme = VALID_THEMES.find(t => t === rawTheme) as ValidTheme | undefined;

          if (!newTheme) {
            console.warn(`Card ${card.id}: invalid theme "${rawTheme}"`);
            skipped++;
            continue;
          }

          const { error: updateError } = await supabase
            .from('friction_cards')
            .update({ theme_key: newTheme })
            .eq('id', card.id);

          if (updateError) {
            console.error(`Card ${card.id} update failed:`, updateError.message);
            skipped++;
          } else {
            updated++;
          }
        }

        // Small delay between API calls
        await sleep(300);
      } catch (err) {
        console.error(`Batch ${i} error:`, err);
        skipped += batch.length;
      }
    }

    const remainingAfter = Math.max(0, (totalRemaining || 0) - updated);
    console.log(`Done: ${updated} updated, ${skipped} skipped, ~${remainingAfter} remaining`);

    return NextResponse.json({
      success: true,
      batch: otherCards.length,
      updated,
      skipped,
      remaining: remainingAfter,
      done: remainingAfter <= 0,
    });
  } catch (error) {
    console.error('Reclassify error:', error);
    return NextResponse.json({
      error: 'Reclassification failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
