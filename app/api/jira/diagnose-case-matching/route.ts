import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = user.id;

    console.log('\n=== DIAGNOSTIC: Salesforce Case → Jira Matching ===\n');

    // Step 1: Get friction cards with Salesforce Case IDs (what we're looking FOR)
    const { data: frictionCardsWithCases } = await supabaseAdmin
      .from('friction_cards')
      .select(`
        id,
        theme_key,
        account_id,
        raw_input:raw_inputs!inner(source_id, source_type)
      `)
      .eq('user_id', userId)
      .eq('is_friction', true)
      .not('raw_inputs.source_id', 'is', null)
      .limit(100);

    // Build the same map the sync code uses
    const caseIdToThemes = new Map<string, Set<string>>();
    const caseIdToAccountId = new Map<string, string>();

    frictionCardsWithCases?.forEach((card: any) => {
      const caseId = card.raw_input?.source_id;
      if (caseId) {
        if (!caseIdToThemes.has(caseId)) {
          caseIdToThemes.set(caseId, new Set());
        }
        caseIdToThemes.get(caseId)!.add(card.theme_key);
        caseIdToAccountId.set(caseId, card.account_id);
      }
    });

    console.log(`Built case mapping: ${caseIdToThemes.size} unique Salesforce Case IDs`);

    // Sample some case IDs
    const sampleCaseIds = Array.from(caseIdToThemes.keys()).slice(0, 20);
    console.log('Sample Salesforce Case IDs:', sampleCaseIds.join(', '));

    // Step 2: Get Jira tickets with custom fields (what we're searching IN)
    const { data: jiraIssues } = await supabaseAdmin
      .from('jira_issues')
      .select('id, jira_key, summary, description, metadata')
      .eq('user_id', userId)
      .not('metadata->custom_fields', 'is', null)
      .limit(200);

    console.log(`Found ${jiraIssues?.length || 0} Jira tickets with custom fields`);

    // Step 3: Try to match using the same logic as sync
    const matches: any[] = [];
    const nonMatches: any[] = [];
    const customFieldSamples: any[] = [];
    const descriptionMatches: any[] = [];

    for (const issue of jiraIssues || []) {
      const customFields = issue.metadata?.custom_fields || {};
      const salesforceCaseIds: string[] = [];

      // Extract 8-digit patterns from ALL custom fields
      for (const [key, value] of Object.entries(customFields)) {
        if (!value) continue;

        const fieldValue = value.toString();

        // Check if VALUE contains 8-digit case numbers (format: 03717747)
        const caseMatches = fieldValue.match(/\b\d{8}\b/g);
        if (caseMatches) {
          salesforceCaseIds.push(...caseMatches);
        }

        // Save some samples for inspection
        if (customFieldSamples.length < 5) {
          customFieldSamples.push({
            jira_key: issue.jira_key,
            field_name: key,
            field_value: fieldValue.substring(0, 200), // Truncate long values
            has_8_digits: !!caseMatches
          });
        }
      }

      // Also check description field (since user said Jira tickets reference SF tickets somewhere)
      if (issue.description) {
        const descCaseMatches = issue.description.match(/\b\d{8}\b/g);
        if (descCaseMatches) {
          const uniqueDescMatches = Array.from(new Set(descCaseMatches));
          for (const caseId of uniqueDescMatches) {
            if (caseIdToThemes.has(caseId)) {
              descriptionMatches.push({
                jira_key: issue.jira_key,
                summary: issue.summary,
                case_id_in_description: caseId,
                themes: Array.from(caseIdToThemes.get(caseId)!),
                note: 'Found in description field, NOT in custom fields'
              });
            }
          }
        }
      }

      // Deduplicate
      const uniqueCaseIds = Array.from(new Set(salesforceCaseIds));

      // Check if any match our case map
      let foundMatch = false;
      for (const caseId of uniqueCaseIds) {
        if (caseIdToThemes.has(caseId)) {
          foundMatch = true;
          matches.push({
            jira_key: issue.jira_key,
            summary: issue.summary,
            extracted_case_ids: uniqueCaseIds,
            matching_case_id: caseId,
            themes: Array.from(caseIdToThemes.get(caseId)!),
            account_id: caseIdToAccountId.get(caseId)
          });
        }
      }

      if (!foundMatch && uniqueCaseIds.length > 0) {
        nonMatches.push({
          jira_key: issue.jira_key,
          summary: issue.summary,
          extracted_case_ids: uniqueCaseIds,
          reason: 'Extracted case IDs but none match our case map'
        });
      }
    }

    console.log(`\nMatching Results:`);
    console.log(`  - ${matches.length} Jira tickets MATCHED via custom fields`);
    console.log(`  - ${descriptionMatches.length} Jira tickets MATCHED via description field`);
    console.log(`  - ${nonMatches.length} Jira tickets had case numbers but NO match`);

    // Step 4: Analyze formats
    const caseIdFormats = sampleCaseIds.map(id => ({
      value: id,
      length: id.length,
      starts_with_zero: id.startsWith('0'),
      is_numeric: /^\d+$/.test(id)
    }));

    return NextResponse.json({
      summary: {
        total_friction_cards: frictionCardsWithCases?.length || 0,
        unique_case_ids_in_map: caseIdToThemes.size,
        jira_tickets_with_custom_fields: jiraIssues?.length || 0,
        matches_found_in_custom_fields: matches.length,
        matches_found_in_descriptions: descriptionMatches.length,
        non_matches: nonMatches.length
      },
      sample_case_ids: sampleCaseIds.slice(0, 10),
      case_id_formats: caseIdFormats.slice(0, 10),
      custom_field_samples: customFieldSamples,
      matches_via_custom_fields: matches.slice(0, 10),
      matches_via_description: descriptionMatches.slice(0, 10),
      non_matches: nonMatches.slice(0, 10),
      diagnosis: {
        case_ids_available: caseIdToThemes.size > 0,
        jira_custom_fields_available: (jiraIssues?.length || 0) > 0,
        custom_field_matches_working: matches.length > 0,
        description_matches_found: descriptionMatches.length > 0,
        possible_issues: [
          matches.length === 0 && descriptionMatches.length > 0
            ? 'Case IDs are in DESCRIPTION field, not custom fields - sync code needs update'
            : null,
          matches.length === 0 && descriptionMatches.length === 0 && caseIdToThemes.size > 0 && (jiraIssues?.length || 0) > 0
            ? 'Case IDs exist, Jira custom fields exist, but NO MATCHES - likely format mismatch or wrong field'
            : null,
          caseIdToThemes.size === 0
            ? 'No Salesforce case IDs found in friction_cards'
            : null,
          (jiraIssues?.length || 0) === 0
            ? 'No Jira tickets have custom_fields populated'
            : null
        ].filter(Boolean)
      }
    });

  } catch (error) {
    console.error('Diagnostic error:', error);
    return NextResponse.json({
      error: 'Diagnostic failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
