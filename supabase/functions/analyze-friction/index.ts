// Supabase Edge Function: analyze-friction
// Deploy with: supabase functions deploy analyze-friction

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RawInput {
  id: string;
  account_id: string;
  user_id: string;
  text_content: string;
  source_type: string;
  metadata: any;
}

serve(async (req) => {
  try {
    const { raw_input_id } = await req.json();

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get raw input
    const { data: rawInput, error: fetchError } = await supabase
      .from('raw_inputs')
      .select('*')
      .eq('id', raw_input_id)
      .single();

    if (fetchError || !rawInput) {
      throw new Error('Raw input not found');
    }

    // Get account context
    const { data: account } = await supabase
      .from('accounts')
      .select('vertical, segment')
      .eq('id', rawInput.account_id)
      .single();

    // Analyze with Claude
    const frictionCard = await analyzeFriction(rawInput, account);

    // Store friction card
    const { data: card, error: insertError } = await supabase
      .from('friction_cards')
      .insert({
        user_id: rawInput.user_id,
        account_id: rawInput.account_id,
        raw_input_id: rawInput.id,
        ...frictionCard,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Mark raw input as processed
    await supabase
      .from('raw_inputs')
      .update({ processed: true })
      .eq('id', raw_input_id);

    // Update account snapshot
    await supabase.rpc('update_account_snapshot', {
      p_account_id: rawInput.account_id
    });

    // Check for alerts
    await checkAndCreateAlerts(supabase, rawInput.account_id, card);

    return new Response(
      JSON.stringify({ success: true, friction_card: card }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error analyzing friction:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function analyzeFriction(rawInput: RawInput, account: any) {
  const prompt = `You are analyzing customer friction from support tickets, notes, and communications.

Context:
- Industry Vertical: ${account?.vertical || 'unknown'}
- Customer Segment: ${account?.segment || 'unknown'}
- Source: ${rawInput.source_type}

Input to analyze:
${rawInput.text_content}

Analyze this input and extract friction signals. Respond with a JSON object containing:

{
  "summary": "One sentence plain English summary of the friction",
  "theme_key": "One of: billing_confusion, insurance_workflow_errors, report_export_issues, data_migration_delays, integration_failures, ui_confusion, performance_issues, missing_features, training_gaps, support_response_time",
  "product_area": "Which part of the product (e.g., 'Billing', 'Reports', 'Insurance Module')",
  "severity": 1-5 (1=minor annoyance, 5=critical/blocking),
  "sentiment": "One of: frustrated, confused, angry, neutral, satisfied",
  "root_cause_hypothesis": "What you think is causing this issue",
  "evidence_snippets": ["quote 1", "quote 2", "quote 3"],
  "confidence_score": 0.0-1.0 (how confident you are in this analysis),
  "reasoning": "Explain how you arrived at this conclusion",
  "lifecycle_stage": "One of: onboarding, active, renewal, churned (if discernible)",
  "is_new_theme": false
}

Be specific and actionable. Extract direct quotes as evidence.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  const data = await response.json();
  const content = data.content[0].text;

  // Parse JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse Claude response');
  }

  return JSON.parse(jsonMatch[0]);
}

async function checkAndCreateAlerts(supabase: any, accountId: string, card: any) {
  // Check for friction spike
  const { data: recentCards } = await supabase
    .from('friction_cards')
    .select('severity')
    .eq('account_id', accountId)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (recentCards && recentCards.length >= 5) {
    const avgSeverity = recentCards.reduce((sum: number, c: any) => sum + c.severity, 0) / recentCards.length;
    
    if (avgSeverity >= 3.5) {
      // Create alert
      await supabase.from('alerts').insert({
        user_id: card.user_id,
        account_id: accountId,
        alert_type: 'friction_spike',
        severity: 'high',
        title: 'Friction Spike Detected',
        message: `${recentCards.length} friction signals in the last 7 days with average severity ${avgSeverity.toFixed(1)}`,
        evidence: {
          card_count: recentCards.length,
          avg_severity: avgSeverity,
          period_days: 7
        },
        recommended_action: 'Review recent friction cards and schedule check-in call with customer',
      });
    }
  }

  // Check for critical severity
  if (card.severity >= 4) {
    await supabase.from('alerts').insert({
      user_id: card.user_id,
      account_id: accountId,
      alert_type: 'critical_severity',
      severity: 'critical',
      title: 'Critical Friction Detected',
      message: card.summary,
      evidence: {
        friction_card_id: card.id,
        theme: card.theme_key,
      },
      recommended_action: 'Immediate escalation recommended',
    });
  }
}
