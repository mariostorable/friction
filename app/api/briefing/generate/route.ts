import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { account_id, briefing_type } = await request.json();

    const supabase = createRouteHandlerClient({ cookies });

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account data
    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', account_id)
      .eq('user_id', user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Get latest snapshot
    const { data: snapshot } = await supabase
      .from('account_snapshots')
      .select('*')
      .eq('account_id', account_id)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    // Get friction cards (last 30 days)
    const { data: frictionCards } = await supabase
      .from('friction_cards')
      .select('*')
      .eq('account_id', account_id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    // Get raw inputs for context
    const { data: rawInputs } = await supabase
      .from('raw_inputs')
      .select('*')
      .eq('account_id', account_id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    // Generate briefing with Claude
    const briefing = await generateBriefingWithClaude({
      account,
      snapshot,
      frictionCards: frictionCards || [],
      rawInputs: rawInputs || [],
      briefingType: briefing_type,
    });

    return NextResponse.json({ briefing });

  } catch (error) {
    console.error('Error generating briefing:', error);
    return NextResponse.json(
      { error: 'Failed to generate briefing' },
      { status: 500 }
    );
  }
}

async function generateBriefingWithClaude(data: any) {
  const { account, snapshot, frictionCards, rawInputs, briefingType } = data;

  const prompt = briefingType === 'quick' 
    ? generateQuickBriefingPrompt(account, snapshot, frictionCards)
    : generateDeepBriefingPrompt(account, snapshot, frictionCards, rawInputs);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: briefingType === 'quick' ? 2000 : 4000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  const result = await response.json();
  const content = result.content[0].text;

  // Parse JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse Claude response');
  }

  return JSON.parse(jsonMatch[0]);
}

function generateQuickBriefingPrompt(account: any, snapshot: any, frictionCards: any[]) {
  const ofiScore = snapshot?.ofi_score || 0;
  const trend = snapshot?.trend_vs_prior_period || 0;
  const trendText = trend > 15 ? '↑ WORSENING' : trend < -15 ? '↓ IMPROVING' : 'STABLE';

  const cardsSummary = frictionCards
    .slice(0, 10)
    .map(card => {
      return `- ${card.summary} (Severity: ${card.severity}, Theme: ${card.theme_key}, Raw Input ID: ${card.raw_input_id})`;
    })
    .join('\n');

  return `You are preparing a quick customer visit briefing for a business executive.

ACCOUNT INFORMATION:
- Name: ${account.name}
- ARR: $${account.arr?.toLocaleString() || 'Unknown'}
- Vertical: ${account.vertical || 'Unknown'}
- Segment: ${account.segment || 'Unknown'}
- Customer Since: ${account.customer_since || 'Unknown'}
- OFI Score: ${ofiScore.toFixed(0)} ${trendText} (${trend > 0 ? '+' : ''}${trend.toFixed(0)}%)

IMPORTANT - OFI SCORE INTERPRETATION:
- The OFI (Operational Friction Index) ranges from 0-100
- LOWER scores are BETTER (0 = no friction, perfect health)
- HIGHER scores are WORSE (100 = maximum friction, critical issues)
- Score ranges:
  * 0-39: Low friction (healthy account)
  * 40-69: Medium friction (needs attention)
  * 70-100: High friction (critical, at-risk)
- Current score of ${ofiScore.toFixed(0)} means: ${ofiScore >= 70 ? 'HIGH FRICTION - Critical issues requiring immediate action' : ofiScore >= 40 ? 'MEDIUM FRICTION - Notable issues to address' : 'LOW FRICTION - Account is healthy'}

RECENT FRICTION SIGNALS (Last 30 days):
${cardsSummary || 'No recent friction signals'}

HIGH SEVERITY COUNT: ${snapshot?.high_severity_count || 0}
TOTAL SIGNALS: ${frictionCards.length}

Generate a JSON object for a QUICK customer visit briefing (2-3 minute read):

{
  "account_name": "${account.name}",
  "visit_date": "${new Date().toISOString().split('T')[0]}",
  "arr": "$${account.arr?.toLocaleString() || 'Unknown'}",
  "vertical": "${account.vertical || 'Unknown'}",
  "segment": "${account.segment || 'Unknown'}",
  "ofi_score": ${ofiScore.toFixed(0)},
  "trend": "${trendText}",
  "attention_items": [
    // IMPORTANT: For each attention item, extract the case_id and case_date:
    // - case_id: Use the raw_input_id from the friction card data
    // - case_date: Extract from the case metadata
    // IMPORTANT: For each attention item, include:
    // - "case_id": Extract from the friction card raw_input_id field
    // - "created_date": Extract from friction card created_at or metadata
    // - Use actual case data, do not make up case IDs
    {
      "title": "Most urgent issue",
      "severity": "critical|high|medium",
      "details": "2-3 sentence description with specific dates/numbers"
    },
    // Include top 3 most critical issues based on severity and recency
  ],
  "talking_points": [
    "Specific action item 1 (acknowledge X, share Y)",
    "Specific action item 2",
    "Specific action item 3"
    // 3-5 concrete, actionable talking points
  ],
  "wins": [
    "Specific positive development 1",
    "Specific positive development 2"
    // 2-3 recent wins or positive signals to reinforce
  ]
}

Be specific with dates, numbers, and concrete details. Focus on what's most actionable for the visit.`;
}

function generateDeepBriefingPrompt(account: any, snapshot: any, frictionCards: any[], rawInputs: any[]) {
  const quickPrompt = generateQuickBriefingPrompt(account, snapshot, frictionCards);

  const recentInputsSummary = rawInputs
    .slice(0, 10)
    .map(input => `[${new Date(input.created_at).toLocaleDateString()}] ${input.text_content.substring(0, 200)}...`)
    .join('\n\n');

  return quickPrompt + `

RECENT INTERACTIONS (Raw data for context):
${recentInputsSummary || 'No recent interactions available'}

Generate a DEEP customer visit briefing (10 minute read) with the same fields as above, PLUS add a "detailed_analysis" object:

{
  // ... all quick briefing fields ...
  "detailed_analysis": {
    "history": "2-3 paragraph narrative about the customer journey, growth trajectory, key milestones, relationship evolution",
    "friction_breakdown": [
      {
        "theme": "Theme name from the friction cards",
        "evidence": ["Direct quote 1", "Direct quote 2", "Direct quote 3"],
        "root_cause": "Detailed hypothesis about what's causing this",
        "recommendation": "Specific recommended solution or action"
      }
      // One for each major theme that appears multiple times
    ],
    "recent_interactions": [
      "Summary of interaction 1 with date and outcome",
      "Summary of interaction 2 with date and outcome"
      // 5-7 most recent significant interactions
    ],
    "opportunities": [
      "Upsell opportunity based on usage patterns",
      "Reference/case study potential",
      "Feature requests that align with roadmap"
      // 3-5 strategic opportunities
    ],
    "risks": [
      "Specific churn indicator with evidence",
      "Budget concern with context",
      "Competitive threat with details"
      // Only include real risks with evidence, not generic ones
    ]
  }
}

Make this briefing actionable and specific. Use real data from the friction signals and interactions. If you don't have enough data for a section, be honest about it rather than making up generic content.`;
}
