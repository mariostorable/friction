'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

export default function JiraFieldDiscovery() {
  const [discovering, setDiscovering] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);

  async function discoverFields() {
    setDiscovering(true);
    try {
      const response = await fetch('/api/jira/discover-fields');
      const data = await response.json();

      if (response.ok) {
        setResults(data);
        console.log('🔍 Jira Field Discovery Results:', data);
      } else {
        console.error('Field discovery failed:', data);
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Discovery error:', error);
      alert('Failed to discover fields');
    } finally {
      setDiscovering(false);
    }
  }

  async function analyzeCustomFields() {
    setAnalyzing(true);
    try {
      const response = await fetch('/api/jira/analyze-custom-fields', {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok) {
        setAnalysis(data);
        console.log('🔍 Custom Fields Analysis:', data);
      } else {
        console.error('Analysis failed:', data);
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Failed to analyze custom fields');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Jira Field Discovery
          </h3>
          <p className="text-xs text-gray-600 mb-3">
            Discover which Jira fields contain account identifiers for better ticket linking
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={discoverFields}
          disabled={discovering}
          className="w-full px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <Search className={`w-4 h-4 ${discovering ? 'animate-spin' : ''}`} />
          {discovering ? 'Analyzing Jira Fields...' : 'Discover Account Fields'}
        </button>

        <button
          onClick={analyzeCustomFields}
          disabled={analyzing}
          className="w-full px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <Search className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
          {analyzing ? 'Analyzing Synced Data...' : 'Analyze Captured Custom Fields'}
        </button>
      </div>

      {results && (
        <div className="mt-4 space-y-3">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs font-semibold text-blue-900 mb-2">Summary</p>
            <div className="space-y-1 text-xs text-blue-800">
              <p>• Total Jira fields: {results.totalFields}</p>
              <p>• Relevant fields found: {results.relevantFields}</p>
              <p>• Fields with data: {results.fieldsWithData?.length || 0}</p>
              <p>• Sample issues analyzed: {results.sampleIssuesAnalyzed}</p>
            </div>
          </div>

          {results.recommendations && results.recommendations.length > 0 && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs font-semibold text-green-900 mb-2">
                Recommended Fields for Account Linking
              </p>
              <div className="space-y-3">
                {results.recommendations.map((rec: any) => (
                  <div key={rec.fieldId} className="border-b border-green-200 last:border-0 pb-2 last:pb-0">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-xs font-medium text-green-900">
                        {rec.fieldName}
                      </p>
                      <code className="text-xs text-green-700 bg-green-100 px-1 rounded">
                        {rec.fieldId}
                      </code>
                    </div>
                    <p className="text-xs text-green-700 mb-1">{rec.reason}</p>
                    {rec.examples && rec.examples.length > 0 && (
                      <div className="mt-1 space-y-1">
                        <p className="text-xs font-medium text-green-800">Examples:</p>
                        {rec.examples.map((ex: any, idx: number) => (
                          <div key={idx} className="text-xs text-green-700 pl-2">
                            • {ex.issueKey}: "{String(ex.value).substring(0, 50)}{String(ex.value).length > 50 ? '...' : ''}"
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!results.recommendations || results.recommendations.length === 0) && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs font-semibold text-yellow-900 mb-1">
                No Structured Fields Found
              </p>
              <p className="text-xs text-yellow-800">
                Your Jira doesn't appear to have custom fields for account identifiers.
                The current name-matching approach is the best option.
              </p>
            </div>
          )}

          <div className="text-xs text-gray-500 italic">
            Check browser console for full JSON output
          </div>
        </div>
      )}

      {analysis && (
        <div className="mt-4 space-y-3">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs font-semibold text-blue-900 mb-2">Analysis Summary</p>
            <div className="space-y-1 text-xs text-blue-800">
              <p>• Issues analyzed: {analysis.total_issues_analyzed}</p>
              <p>• Accounts with Salesforce ID: {analysis.total_accounts}</p>
              <p>• Custom fields found: {analysis.custom_fields_found}</p>
              <p>• Salesforce ID matches: {analysis.salesforce_matches?.length || 0}</p>
            </div>
          </div>

          {analysis.salesforce_matches && analysis.salesforce_matches.length > 0 && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs font-semibold text-green-900 mb-2">
                ✅ Salesforce ID Field Found!
              </p>
              <div className="space-y-2">
                <p className="text-xs text-green-800 font-medium">
                  Field: <code className="bg-green-100 px-1 rounded">{analysis.salesforce_matches[0].custom_field_key}</code>
                </p>
                <div className="space-y-1">
                  <p className="text-xs text-green-700">Matched accounts:</p>
                  {analysis.salesforce_matches.slice(0, 5).map((match: any, idx: number) => (
                    <div key={idx} className="text-xs text-green-700 pl-2">
                      • {match.jira_key}: {match.matched_account}
                    </div>
                  ))}
                  {analysis.salesforce_matches.length > 5 && (
                    <p className="text-xs text-green-700 pl-2">
                      ... and {analysis.salesforce_matches.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {analysis.field_analysis && analysis.field_analysis.length > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
              <p className="text-xs font-semibold text-gray-900 mb-2">
                All Custom Fields ({analysis.field_analysis.length})
              </p>
              <div className="space-y-2">
                {analysis.field_analysis.map((field: any) => (
                  <div key={field.field_key} className="border-b border-gray-200 last:border-0 pb-2 last:pb-0">
                    <code className="text-xs text-gray-900 font-medium">{field.field_key}</code>
                    {field.sample_values && field.sample_values.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {field.sample_values.map((value: string, idx: number) => (
                          <p key={idx} className="text-xs text-gray-600 pl-2 truncate">
                            • {value}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-xs font-semibold text-purple-900 mb-1">
              {analysis.recommendation}
            </p>
          </div>

          <div className="text-xs text-gray-500 italic">
            Check browser console for full JSON output
          </div>
        </div>
      )}
    </div>
  );
}
