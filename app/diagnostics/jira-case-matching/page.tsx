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
        const response = await fetch('/api/jira/diagnose-case-matching');
        if (!response.ok) {
          throw new Error('Failed to fetch diagnostic data');
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchDiagnostic();
  }, []);

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

        {/* Summary */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-600">Friction Cards</div>
              <div className="text-2xl font-bold">{data.summary.total_friction_cards}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Unique Case IDs</div>
              <div className="text-2xl font-bold">{data.summary.unique_case_ids_in_map}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Jira w/ Custom Fields</div>
              <div className="text-2xl font-bold">{data.summary.jira_tickets_with_custom_fields}</div>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <div className="text-sm text-green-700">Matches (Custom Fields)</div>
              <div className="text-2xl font-bold text-green-900">{data.summary.matches_found_in_custom_fields}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded">
              <div className="text-sm text-blue-700">Matches (Description)</div>
              <div className="text-2xl font-bold text-blue-900">{data.summary.matches_found_in_descriptions}</div>
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
