'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function JiraCaseMatchingDiagnostic() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function fetchDiagnostic() {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated - please log in');
        }

        // Step 1: Get ALL friction cards with Salesforce Case IDs (no limit)
        const { data: frictionCardsWithCases, error: frictionError } = await supabase
          .from('friction_cards')
          .select(`
            id,
            theme_key,
            account_id,
            raw_input:raw_inputs!inner(source_id, source_type)
          `)
          .eq('user_id', user.id)
          .eq('is_friction', true)
          .not('raw_inputs.source_id', 'is', null);

        if (frictionError) throw frictionError;

        // Build case ID map
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

        const sampleCaseIds = Array.from(caseIdToThemes.keys()).slice(0, 20);

        // Step 2: Get ALL Jira tickets (no limit to see full picture)
        const { data: jiraIssues, error: jiraError } = await supabase
          .from('jira_issues')
          .select('id, jira_key, summary, description, metadata')
          .eq('user_id', user.id)
          .not('metadata->custom_fields', 'is', null);

        if (jiraError) throw jiraError;

        // Step 3: Comprehensive search
        const matches: any[] = [];
        const nonMatches: any[] = [];
        const customFieldSamples: any[] = [];
        const descriptionMatches: any[] = [];
        const summaryMatches: any[] = [];
        const allCustomFieldNames = new Set<string>();
        const ticketsWithEightDigits: any[] = [];
        const knownLinkedTickets = ['CRM-17', 'CRM-34', 'EDGE-4153', 'EDGE-4289', 'EDGE-4073', 'BUGS-11985'];
        const foundKnownTickets: any[] = [];

        for (const issue of jiraIssues || []) {
          const customFields = issue.metadata?.custom_fields || {};
          const salesforceCaseIds: string[] = [];
          const eightDigitLocations: string[] = [];

          // Track all custom field names
          Object.keys(customFields).forEach(key => allCustomFieldNames.add(key));

          // Track if this is one of the known linked tickets from Looker dashboard
          if (knownLinkedTickets.includes(issue.jira_key)) {
            foundKnownTickets.push({
              jira_key: issue.jira_key,
              summary: issue.summary,
              has_customfield_17254: !!customFields['customfield_17254'],
              customfield_17254_value: customFields['customfield_17254'] || null,
              all_custom_fields: Object.keys(customFields)
            });
          }

          // Extract 8-digit patterns from ALL custom fields
          for (const [key, value] of Object.entries(customFields)) {
            if (!value) continue;

            const fieldValue = value.toString();
            const caseMatches = fieldValue.match(/\b\d{8}\b/g);
            if (caseMatches) {
              salesforceCaseIds.push(...caseMatches);
              eightDigitLocations.push(`custom_field: ${key}`);
            }

            if (customFieldSamples.length < 20) {
              customFieldSamples.push({
                jira_key: issue.jira_key,
                field_name: key,
                field_value: fieldValue.substring(0, 200),
                has_8_digits: !!caseMatches
              });
            }
          }

          // Check summary field
          if (issue.summary) {
            const summaryCaseMatches = issue.summary.match(/\b\d{8}\b/g);
            if (summaryCaseMatches) {
              const uniqueSummaryMatches = Array.from(new Set(summaryCaseMatches));
              for (const caseIdMatch of uniqueSummaryMatches) {
                const caseId = String(caseIdMatch);
                salesforceCaseIds.push(caseId);
                eightDigitLocations.push('summary');
                if (caseIdToThemes.has(caseId)) {
                  summaryMatches.push({
                    jira_key: issue.jira_key,
                    summary: issue.summary,
                    case_id_in_summary: caseId,
                    themes: Array.from(caseIdToThemes.get(caseId)!),
                    note: 'Found in summary field'
                  });
                }
              }
            }
          }

          // Check description field
          if (issue.description) {
            const descCaseMatches = issue.description.match(/\b\d{8}\b/g);
            if (descCaseMatches) {
              const uniqueDescMatches = Array.from(new Set(descCaseMatches));
              for (const caseIdMatch of uniqueDescMatches) {
                const caseId = String(caseIdMatch);
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

          const uniqueCaseIds = Array.from(new Set(salesforceCaseIds));

          // Track tickets with 8-digit patterns
          if (uniqueCaseIds.length > 0) {
            ticketsWithEightDigits.push({
              jira_key: issue.jira_key,
              summary: issue.summary.substring(0, 100),
              case_ids: uniqueCaseIds,
              locations: eightDigitLocations,
              matches_friction: uniqueCaseIds.some(id => caseIdToThemes.has(id))
            });
          }

          // Check matches
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

        const caseIdFormats = sampleCaseIds.map(id => ({
          value: id,
          length: id.length,
          starts_with_zero: id.startsWith('0'),
          is_numeric: /^\d+$/.test(id)
        }));

        setData({
          summary: {
            total_friction_cards: frictionCardsWithCases?.length || 0,
            unique_case_ids_in_map: caseIdToThemes.size,
            jira_tickets_with_custom_fields: jiraIssues?.length || 0,
            tickets_with_8_digit_patterns: ticketsWithEightDigits.length,
            matches_found_in_custom_fields: matches.length,
            matches_found_in_descriptions: descriptionMatches.length,
            matches_found_in_summary: summaryMatches.length,
            non_matches: nonMatches.length,
            unique_custom_field_names: allCustomFieldNames.size,
            known_tickets_found: foundKnownTickets.length
          },
          found_known_tickets: foundKnownTickets,
          sample_case_ids: sampleCaseIds.slice(0, 10),
          case_id_formats: caseIdFormats.slice(0, 10),
          custom_field_samples: customFieldSamples,
          all_custom_field_names: Array.from(allCustomFieldNames).sort(),
          tickets_with_8_digits: ticketsWithEightDigits.slice(0, 20),
          matches_via_custom_fields: matches.slice(0, 10),
          matches_via_description: descriptionMatches.slice(0, 10),
          matches_via_summary: summaryMatches.slice(0, 10),
          non_matches: nonMatches.slice(0, 10),
          diagnosis: {
            case_ids_available: caseIdToThemes.size > 0,
            jira_custom_fields_available: (jiraIssues?.length || 0) > 0,
            eight_digit_patterns_found: ticketsWithEightDigits.length > 0,
            custom_field_matches_working: matches.length > 0,
            description_matches_found: descriptionMatches.length > 0,
            summary_matches_found: summaryMatches.length > 0,
            possible_issues: [
              matches.length === 0 && (summaryMatches.length > 0 || descriptionMatches.length > 0)
                ? 'Case IDs are in summary/description fields, not custom fields - sync code needs update'
                : null,
              ticketsWithEightDigits.length > 0 && matches.length === 0 && descriptionMatches.length === 0 && summaryMatches.length === 0
                ? `Found ${ticketsWithEightDigits.length} tickets with 8-digit patterns, but NONE match friction case IDs - the Jira tickets reference different cases`
                : null,
              ticketsWithEightDigits.length === 0 && (jiraIssues?.length || 0) > 0
                ? 'NO 8-digit patterns found in ANY Jira tickets - case numbers are not in custom fields, summary, or description'
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
      } catch (err) {
        console.error('Diagnostic fetch error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchDiagnostic();
  }, [supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Salesforce → Jira Case Matching Diagnostic</h1>
          <div className="bg-white p-8 rounded-lg shadow">
            <p className="text-gray-600">Loading diagnostic data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Salesforce → Jira Case Matching Diagnostic</h1>
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <p className="text-red-800">Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Salesforce → Jira Case Matching Diagnostic</h1>

        {/* Known Linked Tickets (from Looker dashboard) */}
        {data.found_known_tickets && data.found_known_tickets.length > 0 && (
          <div className="bg-indigo-50 border-2 border-indigo-300 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-indigo-900">
              🔍 Known Linked Tickets (from Looker Dashboard)
            </h2>
            <p className="text-sm text-indigo-700 mb-4">
              Found {data.found_known_tickets.length} out of 6 tickets that Looker shows as linked to Salesforce cases
            </p>
            <div className="space-y-3">
              {data.found_known_tickets.map((ticket: any, idx: number) => (
                <div key={idx} className="bg-white p-4 rounded border border-indigo-200">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono text-sm font-bold">{ticket.jira_key}</span>
                    <span className={`text-xs px-2 py-1 rounded ${ticket.has_customfield_17254 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {ticket.has_customfield_17254 ? '✓ Has customfield_17254' : '✗ No customfield_17254'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700 mb-2">{ticket.summary}</div>
                  {ticket.customfield_17254_value && (
                    <div className="text-xs bg-gray-50 p-2 rounded mb-2">
                      <span className="font-semibold">customfield_17254:</span> {ticket.customfield_17254_value}
                    </div>
                  )}
                  <div className="text-xs text-gray-600">
                    Custom fields present: {ticket.all_custom_fields.length}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">Friction Cards</div>
              <div className="text-2xl font-bold">{data.summary.total_friction_cards}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Unique Case IDs</div>
              <div className="text-2xl font-bold">{data.summary.unique_case_ids_in_map}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Jira Tickets</div>
              <div className="text-2xl font-bold">{data.summary.jira_tickets_with_custom_fields}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded">
              <div className="text-sm text-purple-700">Tickets w/ 8-Digit Patterns</div>
              <div className="text-2xl font-bold text-purple-900">{data.summary.tickets_with_8_digit_patterns}</div>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <div className="text-sm text-green-700">Matches (Custom Fields)</div>
              <div className="text-2xl font-bold text-green-900">{data.summary.matches_found_in_custom_fields}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded">
              <div className="text-sm text-blue-700">Matches (Description)</div>
              <div className="text-2xl font-bold text-blue-900">{data.summary.matches_found_in_descriptions}</div>
            </div>
            <div className="bg-teal-50 p-4 rounded">
              <div className="text-sm text-teal-700">Matches (Summary)</div>
              <div className="text-2xl font-bold text-teal-900">{data.summary.matches_found_in_summary}</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded">
              <div className="text-sm text-yellow-700">Non-Matches</div>
              <div className="text-2xl font-bold text-yellow-900">{data.summary.non_matches}</div>
            </div>
          </div>
        </div>

        {/* Diagnosis */}
        {data.diagnosis.possible_issues && data.diagnosis.possible_issues.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-yellow-900">Possible Issues</h2>
            <ul className="space-y-2">
              {data.diagnosis.possible_issues.map((issue: string, idx: number) => (
                <li key={idx} className="text-yellow-800">• {issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Sample Case IDs */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Sample Salesforce Case IDs (from friction_cards)</h2>
          <div className="space-y-2">
            {data.case_id_formats?.map((fmt: any, idx: number) => (
              <div key={idx} className="font-mono text-sm flex gap-4 p-2 bg-gray-50 rounded">
                <span className="font-bold">{fmt.value}</span>
                <span className="text-gray-600">Length: {fmt.length}</span>
                <span className="text-gray-600">Starts with 0: {fmt.starts_with_zero ? '✓' : '✗'}</span>
                <span className="text-gray-600">Numeric: {fmt.is_numeric ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* All Custom Field Names */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">All Custom Field Names ({data.summary.unique_custom_field_names} total)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {data.all_custom_field_names?.map((fieldName: string, idx: number) => (
              <div key={idx} className="font-mono text-xs bg-gray-50 p-2 rounded truncate" title={fieldName}>
                {fieldName}
              </div>
            ))}
          </div>
        </div>

        {/* Tickets with 8-Digit Patterns */}
        {data.tickets_with_8_digits && data.tickets_with_8_digits.length > 0 && (
          <div className="bg-purple-50 border border-purple-200 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-purple-900">
              Tickets with 8-Digit Patterns ({data.summary.tickets_with_8_digit_patterns} found)
            </h2>
            <div className="space-y-3">
              {data.tickets_with_8_digits.map((ticket: any, idx: number) => (
                <div key={idx} className={`bg-white p-4 rounded border ${ticket.matches_friction ? 'border-green-500' : 'border-gray-200'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono text-sm font-bold">{ticket.jira_key}</span>
                    {ticket.matches_friction && (
                      <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">
                        ✓ Matches Friction Case
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 mb-2">{ticket.summary}</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-gray-100 px-2 py-1 rounded">
                      Case IDs: <span className="font-mono font-bold">{ticket.case_ids.join(', ')}</span>
                    </span>
                    <span className="bg-blue-100 px-2 py-1 rounded">
                      Found in: {ticket.locations.join(', ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Field Samples */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Sample Jira Custom Field Values</h2>
          <div className="space-y-3">
            {data.custom_field_samples?.map((sample: any, idx: number) => (
              <div key={idx} className="border border-gray-200 p-3 rounded">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-sm font-bold">{sample.jira_key}</span>
                  <span className={`text-xs px-2 py-1 rounded ${sample.has_8_digits ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {sample.has_8_digits ? 'Has 8 digits' : 'No 8 digits'}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mb-1">Field: {sample.field_name}</div>
                <div className="font-mono text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                  {sample.field_value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Matches via Custom Fields */}
        {data.matches_via_custom_fields && data.matches_via_custom_fields.length > 0 && (
          <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-green-900">✓ Matches Found (Custom Fields)</h2>
            <div className="space-y-3">
              {data.matches_via_custom_fields.map((match: any, idx: number) => (
                <div key={idx} className="bg-white p-4 rounded border border-green-200">
                  <div className="font-mono text-sm font-bold mb-2">{match.jira_key}</div>
                  <div className="text-sm text-gray-700 mb-2">{match.summary}</div>
                  <div className="flex gap-4 text-sm">
                    <span>Case ID: <span className="font-mono font-bold">{match.matching_case_id}</span></span>
                    <span>Themes: {match.themes.join(', ')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Matches via Description */}
        {data.matches_via_description && data.matches_via_description.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-blue-900">✓ Matches Found (Description Field)</h2>
            <div className="space-y-3">
              {data.matches_via_description.map((match: any, idx: number) => (
                <div key={idx} className="bg-white p-4 rounded border border-blue-200">
                  <div className="font-mono text-sm font-bold mb-2">{match.jira_key}</div>
                  <div className="text-sm text-gray-700 mb-2">{match.summary}</div>
                  <div className="flex gap-4 text-sm">
                    <span>Case ID: <span className="font-mono font-bold">{match.case_id_in_description}</span></span>
                    <span>Themes: {match.themes.join(', ')}</span>
                  </div>
                  <div className="mt-2 text-xs text-blue-700">{match.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Matches via Summary */}
        {data.matches_via_summary && data.matches_via_summary.length > 0 && (
          <div className="bg-teal-50 border border-teal-200 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-teal-900">✓ Matches Found (Summary Field)</h2>
            <div className="space-y-3">
              {data.matches_via_summary.map((match: any, idx: number) => (
                <div key={idx} className="bg-white p-4 rounded border border-teal-200">
                  <div className="font-mono text-sm font-bold mb-2">{match.jira_key}</div>
                  <div className="text-sm text-gray-700 mb-2">{match.summary}</div>
                  <div className="flex gap-4 text-sm">
                    <span>Case ID: <span className="font-mono font-bold">{match.case_id_in_summary}</span></span>
                    <span>Themes: {match.themes.join(', ')}</span>
                  </div>
                  <div className="mt-2 text-xs text-teal-700">{match.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Non-Matches */}
        {data.non_matches && data.non_matches.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Non-Matches (Extracted case IDs but no match in our map)</h2>
            <div className="space-y-3">
              {data.non_matches.map((nonMatch: any, idx: number) => (
                <div key={idx} className="border border-gray-200 p-4 rounded">
                  <div className="font-mono text-sm font-bold mb-2">{nonMatch.jira_key}</div>
                  <div className="text-sm text-gray-700 mb-2">{nonMatch.summary}</div>
                  <div className="text-sm">
                    Extracted: <span className="font-mono">{nonMatch.extracted_case_ids.join(', ')}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-2">{nonMatch.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
