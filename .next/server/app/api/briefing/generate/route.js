"use strict";(()=>{var e={};e.id=458,e.ids=[458],e.modules={72934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},14300:e=>{e.exports=require("buffer")},57246:(e,t,i)=>{i.r(t),i.d(t,{headerHooks:()=>w,originalPathname:()=>_,patchFetch:()=>k,requestAsyncStorage:()=>g,routeModule:()=>h,serverHooks:()=>v,staticGenerationAsyncStorage:()=>f,staticGenerationBailout:()=>y});var n={};i.r(n),i.d(n,{POST:()=>l});var s=i(95419),a=i(69108),o=i(99678),r=i(78070),c=i(57699),d=i(7439);let u=process.env.ANTHROPIC_API_KEY;async function l(e){try{let{account_id:t,briefing_type:i}=await e.json(),n=(0,c.createRouteHandlerClient)({cookies:d.cookies}),{data:{user:s}}=await n.auth.getUser();if(!s)return r.Z.json({error:"Unauthorized"},{status:401});let{data:a}=await n.from("accounts").select("*").eq("id",t).eq("user_id",s.id).single();if(!a)return r.Z.json({error:"Account not found"},{status:404});let{data:o}=await n.from("account_snapshots").select("*").eq("account_id",t).order("snapshot_date",{ascending:!1}).limit(1).single(),{data:u}=await n.from("friction_cards").select("*").eq("account_id",t).gte("created_at",new Date(Date.now()-2592e6).toISOString()).order("created_at",{ascending:!1}),{data:l}=await n.from("raw_inputs").select("*").eq("account_id",t).gte("created_at",new Date(Date.now()-2592e6).toISOString()).order("created_at",{ascending:!1}).limit(20),m=null;try{let i=await fetch(`${e.url.replace("/api/briefing/generate","")}/api/accounts/${t}/jira-status`,{headers:{cookie:e.headers.get("cookie")||""}});i.ok&&(m=await i.json())}catch(e){console.log("Could not fetch Jira status for briefing:",e)}let h=await p({account:a,snapshot:o,frictionCards:u||[],rawInputs:l||[],jiraStatus:m,briefingType:i});return r.Z.json({briefing:h})}catch(e){return console.error("Error generating briefing:",e),r.Z.json({error:"Failed to generate briefing"},{status:500})}}async function p(e){let{account:t,snapshot:i,frictionCards:n,rawInputs:s,jiraStatus:a,briefingType:o}=e,r="quick"===o?m(t,i,n,a):function(e,t,i,n,s){let a=m(e,t,i,s),o=n.slice(0,15).map(e=>`[${new Date(e.created_at).toLocaleDateString()}] ${e.text_content.substring(0,300)}...`).join("\n\n");return a+`

RECENT INTERACTIONS (Raw data for deep analysis):
${o||"No recent interactions available"}

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
- Quality over speed - take the time to analyze deeply and synthesize insights`}(t,i,n,s,a),c=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":u,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"quick"===o?"claude-sonnet-4-20250514":"claude-opus-4-20250514",max_tokens:"quick"===o?3e3:8e3,messages:[{role:"user",content:r}]})}),d=(await c.json()).content[0].text.match(/\{[\s\S]*\}/);if(!d)throw Error("Failed to parse Claude response");return JSON.parse(d[0])}function m(e,t,i,n){let s=t?.ofi_score||0,a=t?.trend_vs_prior_period||0,o=a>15?"↑ WORSENING":a<-15?"↓ IMPROVING":"STABLE",r=i.slice(0,10).map(e=>`- ${e.summary} (Severity: ${e.severity}, Theme: ${e.theme_key}, Raw Input ID: ${e.raw_input_id})`).join("\n"),c="";if(n&&n.summary){let{summary:e,recentlyResolved:t,comingSoon:i,shouldPrioritize:s}=n;c=`

JIRA ROADMAP PROGRESS:
- Recently Resolved (7d): ${e.resolved_7d} tickets
- Recently Resolved (30d): ${e.resolved_30d} tickets
- In Progress: ${e.in_progress} tickets
- On Radar: ${e.open_count-e.in_progress} tickets
- High-Priority Themes Without Tickets: ${e.needs_ticket}

QUICK WINS TO REFERENCE (Recently Resolved):
${t?.slice(0,3).map(e=>`- ${e.jira_key}: ${e.summary} (${e.resolved_days_ago}d ago)`).join("\n")||"None recently"}

COMING SOON (In Development):
${i?.slice(0,3).map(e=>`- ${e.jira_key}: ${e.summary} (Status: ${e.status})`).join("\n")||"None"}

SHOULD PRIORITIZE (High friction, no ticket):
${s?.slice(0,3).map(e=>`- ${e.theme_key}: ${e.case_count} cases, impact score ${Math.round(e.weight)}`).join("\n")||"All covered"}`}return`You are preparing a quick customer visit briefing for a business executive.

ACCOUNT INFORMATION:
- Name: ${e.name}
- ARR: $${e.arr?.toLocaleString()||"Unknown"}
- Products: ${e.products||"Unknown"}
- Business Unit: ${e.vertical||"Unknown"}
- Segment: ${e.segment||"Unknown"}
- Customer Since: ${e.customer_since||"Unknown"}
- OFI Score: ${s.toFixed(0)} ${o} (${a>0?"+":""}${a.toFixed(0)}%)

IMPORTANT - OFI SCORE INTERPRETATION:
- The OFI (Operational Friction Index) ranges from 0-100
- LOWER scores are BETTER (0 = no friction, perfect health)
- HIGHER scores are WORSE (100 = maximum friction, critical issues)
- Score ranges:
  * 0-39: Low friction (healthy account)
  * 40-69: Medium friction (needs attention)
  * 70-100: High friction (critical, at-risk)
- Current score of ${s.toFixed(0)} means: ${s>=70?"HIGH FRICTION - Critical issues requiring immediate action":s>=40?"MEDIUM FRICTION - Notable issues to address":"LOW FRICTION - Account is healthy"}

RECENT FRICTION SIGNALS (Last 30 days):
${r||"No recent friction signals"}

HIGH SEVERITY COUNT: ${t?.high_severity_count||0}${c}
TOTAL SIGNALS: ${i.length}

Generate a JSON object for a QUICK customer visit briefing (2-3 minute read):

{
  "account_name": "${e.name}",
  "visit_date": "${new Date().toISOString().split("T")[0]}",
  "arr": "$${e.arr?.toLocaleString()||"Unknown"}",
  "products": "${e.products||"Unknown"}",
  "business_unit": "${e.vertical||"Unknown"}",
  "segment": "${e.segment||"Unknown"}",
  "ofi_score": ${s.toFixed(0)},
  "trend": "${o}",
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

Be specific with dates, numbers, and concrete details. Focus on what's most actionable for the visit.`}let h=new s.AppRouteRouteModule({definition:{kind:a.x.APP_ROUTE,page:"/api/briefing/generate/route",pathname:"/api/briefing/generate",filename:"route",bundlePath:"app/api/briefing/generate/route"},resolvedPagePath:"/Users/mario/friction-intelligence/app/api/briefing/generate/route.ts",nextConfigOutput:"",userland:n}),{requestAsyncStorage:g,staticGenerationAsyncStorage:f,serverHooks:v,headerHooks:w,staticGenerationBailout:y}=h,_="/api/briefing/generate/route";function k(){return(0,o.patchFetch)({serverHooks:v,staticGenerationAsyncStorage:f})}}};var t=require("../../../../webpack-runtime.js");t.C(e);var i=e=>t(t.s=e),n=t.X(0,[456,552,421],()=>i(57246));module.exports=n})();