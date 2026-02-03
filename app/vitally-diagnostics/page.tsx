'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function VitallyDiagnostics() {
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientComponentClient();
  const router = useRouter();

  async function runDiagnostics() {
    setLoading(true);
    setError(null);
    try {
      // Check integration status
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('integration_type', 'vitally')
        .single();

      // Check vitally_accounts count
      const { count: vitallyCount } = await supabase
        .from('vitally_accounts')
        .select('*', { count: 'exact', head: true });

      // Get sample vitally accounts
      const { data: sampleAccounts } = await supabase
        .from('vitally_accounts')
        .select('account_name, health_score, vitally_account_id')
        .limit(5);

      // Test Vitally API connection
      const testResponse = await fetch('/api/vitally/debug');
      let apiTest = null;
      if (testResponse.ok) {
        apiTest = await testResponse.json();
      } else {
        const errorText = await testResponse.text();
        apiTest = { error: errorText };
      }

      // Get match status
      const matchResponse = await fetch('/api/vitally/match-status');
      let matchStatus = null;
      if (matchResponse.ok) {
        matchStatus = await matchResponse.json();
      }

      setDiagnostics({
        integration: integration || 'Not found',
        vitallyAccountsCount: vitallyCount,
        sampleAccounts: sampleAccounts || [],
        apiTest: apiTest,
        matchStatus: matchStatus,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/settings')}
              className="text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Vitally Diagnostics</h1>
              <p className="mt-1 text-sm text-gray-500">Debug Vitally integration issues</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <button
            onClick={runDiagnostics}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 mb-6"
          >
            {loading ? 'Running Diagnostics...' : 'Run Diagnostics'}
          </button>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {diagnostics && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Integration Status</h3>
                <pre className="bg-gray-50 p-4 rounded border border-gray-200 overflow-auto">
                  {JSON.stringify(diagnostics.integration, null, 2)}
                </pre>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Database Records</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Found {diagnostics.vitallyAccountsCount} records in vitally_accounts table
                </p>
                {diagnostics.sampleAccounts.length > 0 && (
                  <pre className="bg-gray-50 p-4 rounded border border-gray-200 overflow-auto">
                    {JSON.stringify(diagnostics.sampleAccounts, null, 2)}
                  </pre>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Account Matching Status</h3>
                {diagnostics.matchStatus ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 p-4 rounded border border-blue-200">
                        <p className="text-sm text-blue-900 font-medium">Total Vitally Accounts</p>
                        <p className="text-2xl font-bold text-blue-900">{diagnostics.matchStatus.summary.total_vitally_accounts}</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded border border-green-200">
                        <p className="text-sm text-green-900 font-medium">Matched to Salesforce</p>
                        <p className="text-2xl font-bold text-green-900">{diagnostics.matchStatus.summary.matched_vitally_accounts}</p>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded border border-yellow-200">
                        <p className="text-sm text-yellow-900 font-medium">Unmatched Accounts</p>
                        <p className="text-2xl font-bold text-yellow-900">{diagnostics.matchStatus.summary.unmatched_vitally_accounts}</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded border border-purple-200">
                        <p className="text-sm text-purple-900 font-medium">SF Accounts with Vitally Data</p>
                        <p className="text-2xl font-bold text-purple-900">{diagnostics.matchStatus.summary.salesforce_accounts_with_vitally_data}</p>
                      </div>
                    </div>
                    <details className="bg-gray-50 p-4 rounded border border-gray-200">
                      <summary className="cursor-pointer font-medium text-sm">View Full Match Status</summary>
                      <pre className="mt-3 text-xs overflow-auto max-h-64">
                        {JSON.stringify(diagnostics.matchStatus, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">Loading match status...</p>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Vitally API Test</h3>
                <pre className="bg-gray-50 p-4 rounded border border-gray-200 overflow-auto max-h-96">
                  {JSON.stringify(diagnostics.apiTest, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
