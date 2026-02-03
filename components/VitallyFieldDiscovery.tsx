'use client';

import { useState } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';

interface VitallyFieldDiscoveryData {
  totalAccounts: number;
  availableFields: string[];
  sampleAccounts: Array<{
    accountName: string;
    sampleData: any;
  }>;
}

export default function VitallyFieldDiscovery() {
  const [data, setData] = useState<VitallyFieldDiscoveryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);

  async function discover() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/vitally/explore');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to discover fields');
      }
      const result = await response.json();
      setData(result);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Vitally Field Discovery</h3>
          <p className="text-sm text-gray-600 mt-1">
            Explore what data fields are available in your Vitally accounts
          </p>
        </div>
        <button
          onClick={discover}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Search className="w-4 h-4" />
          {loading ? 'Discovering...' : 'Discover Fields'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Found {data.availableFields.length} unique fields across {data.totalAccounts} sample accounts
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Click on an account below to see its raw data structure
                </p>
              </div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-blue-600 hover:text-blue-700"
              >
                {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {expanded && (
            <>
              {/* Available Fields */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Available Fields ({data.availableFields.length})</h4>
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                  <div className="grid grid-cols-3 gap-2 p-3">
                    {data.availableFields.map((field) => (
                      <div
                        key={field}
                        className="px-2 py-1 bg-gray-50 text-xs font-mono text-gray-700 rounded border border-gray-200"
                      >
                        {field}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sample Account Data */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Sample Account Data</h4>
                <div className="space-y-2">
                  {data.sampleAccounts.map((account, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg">
                      <button
                        onClick={() => setSelectedAccount(selectedAccount === idx ? null : idx)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                      >
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-900">{account.accountName}</p>
                          <p className="text-xs text-gray-500">Click to view raw data structure</p>
                        </div>
                        {selectedAccount === idx ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </button>

                      {selectedAccount === idx && (
                        <div className="px-4 pb-4 border-t border-gray-200">
                          <div className="mt-3 max-h-96 overflow-auto bg-gray-50 rounded border border-gray-200 p-3">
                            <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                              {JSON.stringify(account.sampleData, null, 2)}
                            </pre>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            This shows the complete data structure from Vitally. Use this to identify which fields are relevant for your analysis.
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Help Text */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">How to use this data</h4>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• All Vitally data is stored in the <code className="px-1 py-0.5 bg-white rounded border border-gray-300 font-mono">traits</code> JSONB field</li>
                  <li>• Currently displaying: <strong>health_score</strong>, <strong>nps_score</strong>, <strong>status</strong>, <strong>mrr</strong>, and <strong>last_activity_at</strong></li>
                  <li>• To add more fields to the UI, identify relevant fields above and update the sync endpoint</li>
                  <li>• All raw data is preserved in the database for future analysis</li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {!data && !loading && (
        <div className="text-center py-8 text-gray-500">
          <Search className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-sm">Click "Discover Fields" to explore your Vitally data structure</p>
        </div>
      )}
    </div>
  );
}
