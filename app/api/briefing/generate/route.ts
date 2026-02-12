import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

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

    // Get Jira status data
    let jiraStatus = null;
    try {
      const jiraResponse = await fetch(`${request.url.replace('/api/briefing/generate', '')}/api/accounts/${account_id}/jira-status`, {
        headers: {
          cookie: request.headers.get('cookie') || '',
        },
      });
      if (jiraResponse.ok) {
        jiraStatus = await jiraResponse.json();
      }
    } catch (error) {
      console.log('Could not fetch Jira status for briefing:', error);
    }

    // Generate briefing with Claude
    const briefing = await generateBriefingWithClaude({
      account,
      snapshot,
      frictionCards: frictionCards || [],
      rawInputs: rawInputs || [],
      jiraStatus,
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
  const { account, snapshot, frictionCards, rawInputs, jiraStatus, briefingType } = data;

  const prompt = briefingType === 'quick'
    ? generateQuickBriefingPrompt(account, snapshot, frictionCards, jiraStatus)
    : generateDeepBriefingPrompt(account, snapshot, frictionCards, rawInputs, jiraStatus);

  // Use different models and token limits based on briefing type
  const model = briefingType === 'quick'
    ? 'claude-sonnet-4-20250514'      // Smart, balanced for quick briefings
    : 'claude-opus-4-20250514';       // Most powerful for deep analysis

  const maxTokens = briefingType === 'quick' ? 3000 : 8000;  // More tokens for deep analysis

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
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

function generateQuickBriefingPrompt(account: any, snapshot: any, frictionCards: any[], jiraStatus: any) {
  const ofiScore = snapshot?.ofi_score || 0;
  const trend = snapshot?.trend_vs_prior_period || 0;
  const trendText = trend > 15 ? '↑ WORSENING' : trend < -15 ? '↓ IMPROVING' : 'STABLE';

  const cardsSummary = frictionCards
    .slice(0, 10)
    .map(card => {
      return `- ${card.summary} (Severity: ${card.severity}, Theme: ${card.theme_key}, Raw Input ID: ${card.raw_input_id})`;
    })
    .join('\n');

  // Format Jira data
  let jiraSection = '';
  if (jiraStatus && jiraStatus.summary) {
    const { summary, recentlyResolved, comingSoon, shouldPrioritize } = jiraStatus;
    jiraSection = `

JIRA ROADMAP PROGRESS:
- Recently Resolved (30d): ${summary.resolved_30d} tickets
- In Progress: ${summary.in_progress} tickets
- On Radar: ${summary.open_count - summary.in_progress} tickets
- High-Priority Themes Without Tickets: ${summary.needs_ticket}

QUICK WINS TO REFERENCE (Recently Resolved):
${recentlyResolved?.slice(0, 3).map((issue: any) =>
  `- ${issue.jira_key}: ${issue.summary} (${issue.resolved_days_ago}d ago)`
).join('\n') || 'None recently'}

COMING SOON (In Development):
${comingSoon?.slice(0, 3).map((issue: any) =>
  `- ${issue.jira_key}: ${issue.summary} (Status: ${issue.status})`
).join('\n') || 'None'}

SHOULD PRIORITIZE (High friction, no ticket):
${shouldPrioritize?.slice(0, 3).map((theme: any) =>
  `- ${theme.theme_key}: ${theme.case_count} cases, impact score ${Math.round(theme.weight)}`
).join('\n') || 'All covered'}`;
  }

  // Format Vitally health data
  let vitallySection = '';
  if (account.vitally_health_score !== null || account.vitally_nps_score !== null) {
    vitallySection = '\n\nVITALLY CUSTOMER HEALTH:';
    if (account.vitally_health_score !== null) {
      const healthStatus = account.vitally_health_score >= 80 ? 'Healthy' :
                          account.vitally_health_score >= 60 ? 'At Risk' : 'Critical';
      vitallySection += `\n- Health Score: ${Math.round(account.vitally_health_score)}/100 (${healthStatus})`;
    }
    if (account.vitally_nps_score !== null) {
      const npsStatus = account.vitally_nps_score >= 50 ? 'Promoter' :
                       account.vitally_nps_score >= 0 ? 'Passive' : 'Detractor';
      vitallySection += `\n- NPS Score: ${Math.round(account.vitally_nps_score)} (${npsStatus})`;
    }
    if (account.vitally_status) {
      vitallySection += `\n- Status: ${account.vitally_status}`;
    }
    if (account.vitally_last_activity_at) {
      vitallySection += `\n- Last Activity: ${new Date(account.vitally_last_activity_at).toLocaleDateString()}`;
    }
  }

  return `You are preparing a quick customer visit briefing for a business executive.

ACCOUNT INFORMATION:
- Name: ${account.name}
- ARR: $${account.arr?.toLocaleString() || 'Unknown'}
- Products: ${account.products || 'Unknown'}
- Business Unit: ${account.vertical || 'Unknown'}
- Segment: ${account.segment || 'Unknown'}
- Customer Since: ${account.customer_since || 'Unknown'}
- OFI Score: ${ofiScore.toFixed(0)} ${trendText} (${trend > 0 ? '+' : ''}${trend.toFixed(0)}%)${vitallySection}

IMPORTANT - OFI SCORE INTERPRETATION:
- The OFI (Operational Friction Index) ranges from 0-100
- LOWER scores are BETTER (0 = no friction, perfect health)
- HIGHER scores are WORSE (100 = maximum friction, critical issues)
- Score ranges:
  * 0-39: Low friction (healthy account)
  * 40-69: Medium friction (needs attention)
  * 70-100: High friction (critical, at-risk)
- Current score of ${ofiScore.toFixed(0)} means: ${ofiScore >= 70 ? 'HIGH FRICTION - Critical issues requiring immediate action' : ofiScore >= 40 ? 'MEDIUM FRICTION - Notable issues to address' : 'LOW FRICTION - Account is healthy'}

IMPORTANT - VITALLY & JIRA CONTEXT:
- Use Vitally health scores to contextualize friction: Low health + high friction = urgent concern
- Reference recent Jira fixes as "wins" and proof of responsiveness
- Highlight in-progress Jira tickets as "coming improvements" when discussing friction themes
- If high friction themes have no Jira tickets, flag these as priorities for product team
- Consider NPS alongside OFI: Detractors with high OFI need immediate intervention

RECENT FRICTION SIGNALS (Last 30 days):
${cardsSummary || 'No recent friction signals'}

HIGH SEVERITY COUNT: ${snapshot?.high_severity_count || 0}${jiraSection}
TOTAL SIGNALS: ${frictionCards.length}

Generate a JSON object for a QUICK customer visit briefing (2-3 minute read):

{
  "account_name": "${account.name}",
  "visit_date": "${new Date().toISOString().split('T')[0]}",
  "arr": "$${account.arr?.toLocaleString() || 'Unknown'}",
  "products": "${account.products || 'Unknown'}",
  "business_unit": "${account.vertical || 'Unknown'}",
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
    "Specific action item 1 (acknowledge friction, share roadmap progress)",
    "Specific action item 2 (reference Jira tickets addressing their issues)",
    "Specific action item 3 (commit to prioritizing high-impact themes)"
    // 3-5 concrete, actionable talking points linking friction to roadmap
  ],
  "wins": [
    "Recent Jira fix that addresses their friction (with ticket number)",
    "Positive trend in Vitally health/NPS or declining OFI score",
    "Specific case resolution or improved response time"
    // 2-3 wins - prioritize recently resolved Jira tickets that fix their issues
  ]
}

Be specific with dates, numbers, and concrete details. Focus on what's most actionable for the visit.`;
}

function generateDeepBriefingPrompt(account: any, snapshot: any, frictionCards: any[], rawInputs: any[], jiraStatus: any) {
  const quickPrompt = generateQuickBriefingPrompt(account, snapshot, frictionCards, jiraStatus);

  const recentInputsSummary = rawInputs
    .slice(0, 15)
    .map(input => `[${new Date(input.created_at).toLocaleDateString()}] ${input.text_content.substring(0, 300)}...`)
    .join('\n\n');

  return quickPrompt + `

RECENT INTERACTIONS (Raw data for deep analysis):
${recentInputsSummary || 'No recent interactions available'}

You are Claude Opus, the most advanced AI assistant. Generate a COMPREHENSIVE customer visit briefing (15-20 minute read) that demonstrates deep understanding and strategic insight.

Your analysis should be:
1. Data-driven: Base every claim on specific evidence from the friction signals and interactions
2. Pattern-seeking: Identify underlying patterns and root causes, not just surface symptoms
3. Strategic: Connect tactical issues to broader business implications
4. Forward-looking: Anticipate future risks and opportunities
5. Actionable: Provide specific, implementable recommendations

Generate a DEEP customer visit briefing with the same fields as above, PLUS add a "detailed_analysis" object:

{
  // ... all quick briefing fields ...
  "detailed_analysis": {
    "executive_summary": "3-4 sentence high-level assessment of account health, key concerns, and strategic recommendations. This should synthesize the entire briefing into a C-suite-ready summary.",
    "history": "3-4 paragraph narrative about the customer journey, growth trajectory, key milestones, relationship evolution. Include specific dates, ARR changes, product adoptions, and significant events. Tell the story of this relationship.",
    "friction_breakdown": [
      {
        "theme": "Theme name from the friction cards (e.g., 'Data Import Issues', 'Performance Problems')",
        "frequency": "How often this appears (number of cases)",
        "severity_trend": "Is this getting better, worse, or staying the same?",
        "evidence": ["Direct quote 1 with date", "Direct quote 2 with date", "Direct quote 3 with date"],
        "root_cause": "Deep hypothesis about what's causing this. Connect to product gaps, training issues, implementation problems, or business process mismatches. Be specific.",
        "business_impact": "How does this affect their operations? What does it cost them? Why do they care?",
        "recommendation": "Specific 3-5 step action plan to resolve this. Include who should do what, timeline, and expected outcome.",
        "quick_wins": "Immediate tactical fixes that could provide relief while longer-term solution is implemented"
      }
      // One for each major theme (include ALL themes with 2+ occurrences)
    ],
    "health_indicators": {
      "positive_signals": ["Specific evidence of satisfaction, adoption, engagement - with dates and context"],
      "warning_signs": ["Specific red flags with evidence - usage drops, escalations, executive involvement"],
      "engagement_level": "Detailed assessment of how engaged they are: ticket volume trends, response times, stakeholder involvement",
      "satisfaction_trajectory": "Is satisfaction improving or declining? What's the trend based on case sentiment and friction patterns?"
    },
    "recent_interactions": [
      "Detailed summary of interaction with date, participants, topic, outcome, and follow-up status"
      // 7-10 most recent significant interactions with full context
    ],
    "strategic_insights": {
      "account_priorities": ["What matters most to this customer right now based on their case patterns and interactions"],
      "decision_makers": ["Key stakeholders and their concerns based on who's involved in cases"],
      "buying_signals": ["Evidence of expansion interest or renewal concerns"],
      "competitive_landscape": ["Any mentions of competitors or alternative solutions"],
      "organizational_changes": ["Leadership changes, mergers, growth, restructuring that affect our relationship"]
    },
    "opportunities": [
      {
        "type": "upsell|expansion|reference|advocacy",
        "description": "Specific opportunity with clear business case",
        "evidence": "What signals indicate this opportunity exists",
        "timing": "When to act and why",
        "approach": "How to position and who to engage"
      }
      // 3-5 strategic opportunities with full context
    ],
    "risks": [
      {
        "type": "churn|contraction|satisfaction|competitive",
        "severity": "critical|high|medium|low",
        "description": "Specific risk with clear evidence",
        "evidence": ["Direct quotes or data points supporting this risk"],
        "probability": "Likelihood assessment with reasoning",
        "mitigation": "Specific steps to address this risk",
        "timeline": "How urgent is this? When might it materialize?"
      }
      // Include ALL real risks with evidence - don't hold back, but be honest if evidence is weak
    ],
    "visit_strategy": {
      "primary_objectives": ["Top 3 goals for this visit - what must be accomplished"],
      "key_messages": ["Core messages to deliver - positioning, value, commitment"],
      "tough_conversations": ["Difficult topics that need to be addressed and how to approach them"],
      "success_criteria": ["How we'll know this visit was successful"],
      "follow_up_plan": ["Specific commitments and next steps to confirm during the visit"]
    }
  }
}

CRITICAL INSTRUCTIONS:
- Be exhaustive and comprehensive - this is a strategic document that justifies the Opus model
- Every statement must be grounded in specific evidence from the friction signals or interactions
- Include dates, numbers, quotes, and specific details throughout
- Connect tactical issues to strategic implications
- Identify patterns across multiple friction signals
- Be honest about gaps in data rather than speculating
- Make this briefing significantly more valuable than the quick version
- Think like a management consultant preparing for a high-stakes client meeting
- Quality over speed - take the time to analyze deeply and synthesize insights
- INTEGRATE JIRA & VITALLY: Reference specific Jira tickets in friction analysis, cite Vitally health trends, connect roadmap progress to customer satisfaction
- For each friction theme, check if there's a Jira ticket addressing it - if yes, reference the ticket and status; if no, flag it as needing prioritization
- Use Vitally NPS and health scores to validate or contextualize friction patterns (e.g., "Despite NPS of 65, OFI shows underlying issues")
- In wins/talking points, lead with recently resolved Jira tickets that address their specific friction points`;
}
