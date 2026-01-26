"use strict";(()=>{var e={};e.id=458,e.ids=[458],e.modules={72934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},14300:e=>{e.exports=require("buffer")},57246:(e,t,i)=>{i.r(t),i.d(t,{headerHooks:()=>_,originalPathname:()=>S,patchFetch:()=>b,requestAsyncStorage:()=>f,routeModule:()=>g,serverHooks:()=>w,staticGenerationAsyncStorage:()=>h,staticGenerationBailout:()=>v});var a={};i.r(a),i.d(a,{POST:()=>l});var n=i(95419),r=i(69108),o=i(99678),s=i(78070),c=i(57699),d=i(7439);let u=process.env.ANTHROPIC_API_KEY;async function l(e){try{let{account_id:t,briefing_type:i}=await e.json(),a=(0,c.createRouteHandlerClient)({cookies:d.cookies}),{data:{user:n}}=await a.auth.getUser();if(!n)return s.Z.json({error:"Unauthorized"},{status:401});let{data:r}=await a.from("accounts").select("*").eq("id",t).eq("user_id",n.id).single();if(!r)return s.Z.json({error:"Account not found"},{status:404});let{data:o}=await a.from("account_snapshots").select("*").eq("account_id",t).order("snapshot_date",{ascending:!1}).limit(1).single(),{data:u}=await a.from("friction_cards").select("*").eq("account_id",t).gte("created_at",new Date(Date.now()-2592e6).toISOString()).order("created_at",{ascending:!1}),{data:l}=await a.from("raw_inputs").select("*").eq("account_id",t).gte("created_at",new Date(Date.now()-2592e6).toISOString()).order("created_at",{ascending:!1}).limit(20),m=await p({account:r,snapshot:o,frictionCards:u||[],rawInputs:l||[],briefingType:i});return s.Z.json({briefing:m})}catch(e){return console.error("Error generating briefing:",e),s.Z.json({error:"Failed to generate briefing"},{status:500})}}async function p(e){let{account:t,snapshot:i,frictionCards:a,rawInputs:n,briefingType:r}=e,o="quick"===r?m(t,i,a):function(e,t,i,a){let n=m(e,t,i),r=a.slice(0,10).map(e=>`[${new Date(e.created_at).toLocaleDateString()}] ${e.text_content.substring(0,200)}...`).join("\n\n");return n+`

RECENT INTERACTIONS (Raw data for context):
${r||"No recent interactions available"}

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

Make this briefing actionable and specific. Use real data from the friction signals and interactions. If you don't have enough data for a section, be honest about it rather than making up generic content.`}(t,i,a,n),s=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":u,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:"quick"===r?2e3:4e3,messages:[{role:"user",content:o}]})}),c=(await s.json()).content[0].text.match(/\{[\s\S]*\}/);if(!c)throw Error("Failed to parse Claude response");return JSON.parse(c[0])}function m(e,t,i){let a=t?.ofi_score||0,n=t?.trend_vs_prior_period||0,r=n>15?"↑ WORSENING":n<-15?"↓ IMPROVING":"STABLE",o=i.slice(0,10).map(e=>`- ${e.summary} (Severity: ${e.severity}, Theme: ${e.theme_key}, Raw Input ID: ${e.raw_input_id})`).join("\n");return`You are preparing a quick customer visit briefing for a business executive.

ACCOUNT INFORMATION:
- Name: ${e.name}
- ARR: $${e.arr?.toLocaleString()||"Unknown"}
- Vertical: ${e.vertical||"Unknown"}
- Segment: ${e.segment||"Unknown"}
- Customer Since: ${e.customer_since||"Unknown"}
- OFI Score: ${a.toFixed(0)} ${r} (${n>0?"+":""}${n.toFixed(0)}%)

RECENT FRICTION SIGNALS (Last 30 days):
${o||"No recent friction signals"}

HIGH SEVERITY COUNT: ${t?.high_severity_count||0}
TOTAL SIGNALS: ${i.length}

Generate a JSON object for a QUICK customer visit briefing (2-3 minute read):

{
  "account_name": "${e.name}",
  "visit_date": "${new Date().toISOString().split("T")[0]}",
  "arr": "$${e.arr?.toLocaleString()||"Unknown"}",
  "vertical": "${e.vertical||"Unknown"}",
  "segment": "${e.segment||"Unknown"}",
  "ofi_score": ${a.toFixed(0)},
  "trend": "${r}",
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

Be specific with dates, numbers, and concrete details. Focus on what's most actionable for the visit.`}let g=new n.AppRouteRouteModule({definition:{kind:r.x.APP_ROUTE,page:"/api/briefing/generate/route",pathname:"/api/briefing/generate",filename:"route",bundlePath:"app/api/briefing/generate/route"},resolvedPagePath:"/Users/mario/friction-intelligence/app/api/briefing/generate/route.ts",nextConfigOutput:"",userland:a}),{requestAsyncStorage:f,staticGenerationAsyncStorage:h,serverHooks:w,headerHooks:_,staticGenerationBailout:v}=g,S="/api/briefing/generate/route";function b(){return(0,o.patchFetch)({serverHooks:w,staticGenerationAsyncStorage:h})}}};var t=require("../../../../webpack-runtime.js");t.C(e);var i=e=>t(t.s=e),a=t.X(0,[456,552,421],()=>i(57246));module.exports=a})();