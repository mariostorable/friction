'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

export default function JiraFieldDiscovery() {
  const [discovering, setDiscovering] = useState(false);
  const [results, setResults] = useState<any>(null);

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

      <button
        onClick={discoverFields}
        disabled={discovering}
        className="w-full px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        <Search className={`w-4 h-4 ${discovering ? 'animate-spin' : ''}`} />
        {discovering ? 'Analyzing Jira Fields...' : 'Discover Account Fields'}
      </button>

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
    </div>
  );
}
