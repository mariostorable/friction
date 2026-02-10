'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function TestSyncPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  const triggerSync = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Check auth first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated. Please log in first.');
        setLoading(false);
        return;
      }

      console.log('User authenticated:', user.email);
      console.log('Triggering sync...');

      const response = await fetch('/api/salesforce/sync', {
        method: 'POST',
      });

      const data = await response.json();
      console.log('Sync response:', data);

      if (!response.ok) {
        setError(JSON.stringify(data, null, 2));
      } else {
        setResult(data);
      }
    } catch (e) {
      console.error('Sync error:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Salesforce Sync Test</h1>

        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <button
            onClick={triggerSync}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Syncing...' : 'Trigger Salesforce Sync'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <h3 className="text-red-800 font-medium mb-2">Error</h3>
            <pre className="text-sm text-red-700 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {result && (
          <div className="bg-green-50 border-l-4 border-green-400 p-4">
            <h3 className="text-green-800 font-medium mb-2">Success!</h3>
            <pre className="text-sm text-green-700 whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
