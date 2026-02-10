'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function FixSalesforcePage() {
  const [user, setUser] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function checkStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from('integrations')
          .select('id, integration_type, status, connected_at')
          .eq('user_id', user.id)
          .eq('integration_type', 'salesforce')
          .order('connected_at', { ascending: false });

        setIntegrations(data || []);
      }

      setLoading(false);
    }

    checkStatus();
  }, []);

  const deleteAllAndReconnect = async () => {
    if (!user) {
      alert('Not logged in');
      return;
    }

    if (!confirm('This will delete all existing Salesforce integrations and let you start fresh. Continue?')) {
      return;
    }

    setDeleting(true);
    setDeleteResult(null);

    try {
      // Call cleanup endpoint
      const response = await fetch('/api/debug/cleanup-salesforce', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setDeleteResult(`Deleted ${data.deleted} integration(s). Now redirecting to Salesforce OAuth...`);

        // Wait 1 second then redirect to OAuth
        setTimeout(() => {
          window.location.href = '/api/auth/salesforce';
        }, 1000);
      } else {
        setDeleteResult(`Error: ${JSON.stringify(data)}`);
        setDeleting(false);
      }
    } catch (e) {
      setDeleteResult(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
      setDeleting(false);
    }
  };

  const reconnectNow = () => {
    window.location.href = '/api/auth/salesforce';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Fix Salesforce Connection</h1>

        {/* User Status */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">Authentication Status</h2>
          {user ? (
            <div className="text-green-700">
              ✓ Logged in as: {user.email}
            </div>
          ) : (
            <div className="text-red-700">
              ✗ Not logged in - please log in first
            </div>
          )}
        </div>

        {/* Integration Status */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">Salesforce Integrations</h2>

          {integrations.length === 0 ? (
            <p className="text-gray-600">No Salesforce integrations found.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Found {integrations.length} integration(s):
              </p>
              {integrations.map((int, i) => (
                <div key={int.id} className="border-l-4 border-blue-400 pl-4 py-2 bg-blue-50">
                  <div className="text-sm font-mono">ID: {int.id}</div>
                  <div className="text-sm">Status: {int.status}</div>
                  <div className="text-sm">Connected: {new Date(int.connected_at).toLocaleString()}</div>
                </div>
              ))}

              {integrations.length > 1 && (
                <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-400">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Multiple integrations detected! This causes sync failures.
                    Delete all and reconnect fresh.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">Fix Options</h2>

          <div className="space-y-4">
            {/* Option 1: Just reconnect (if 0 or 1 integrations) */}
            {integrations.length <= 1 && (
              <div className="border p-4 rounded">
                <h3 className="font-medium mb-2">Option 1: Reconnect Salesforce</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Click below to go through Salesforce OAuth. The new code will automatically
                  clean up any old integrations and create a fresh one.
                </p>
                <button
                  onClick={reconnectNow}
                  disabled={!user}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Reconnect Salesforce Now
                </button>
              </div>
            )}

            {/* Option 2: Delete all first, then reconnect */}
            <div className="border p-4 rounded">
              <h3 className="font-medium mb-2">
                {integrations.length > 1 ? 'Recommended: ' : 'Option 2: '}
                Delete All & Reconnect
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Delete all existing Salesforce integrations, then immediately redirect to OAuth
                to create a fresh one.
              </p>
              <button
                onClick={deleteAllAndReconnect}
                disabled={!user || deleting}
                className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:bg-gray-400"
              >
                {deleting ? 'Deleting...' : 'Delete All & Reconnect'}
              </button>

              {deleteResult && (
                <div className="mt-4 p-3 bg-gray-100 rounded text-sm">
                  {deleteResult}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
          <h3 className="font-medium text-blue-900 mb-2">What happens next:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
            <li>You'll be redirected to Salesforce to log in</li>
            <li>After OAuth completes, you'll return to the dashboard</li>
            <li>Go to /test-sync and click "Trigger Salesforce Sync"</li>
            <li>Your dashboard should show the correct Top 25 accounts</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
