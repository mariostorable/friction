'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RefreshCw } from 'lucide-react';

export default function JiraSyncButton() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncStats, setSyncStats] = useState<{
    lastSynced: string | null;
    totalIssues: number;
    hasIntegration: boolean;
  }>({ lastSynced: null, totalIssues: 0, hasIntegration: false });

  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchSyncStats();
  }, []);

  async function fetchSyncStats() {
    try {
      // Check if user has Jira integration
      const { data: integration } = await supabase
        .from('integrations')
        .select('last_synced_at')
        .eq('integration_type', 'jira')
        .eq('status', 'active')
        .single();

      if (!integration) {
        setSyncStats({ lastSynced: null, totalIssues: 0, hasIntegration: false });
        setLoading(false);
        return;
      }

      // Get total count of Jira issues
      const { count } = await supabase
        .from('jira_issues')
        .select('*', { count: 'exact', head: true });

      setSyncStats({
        lastSynced: integration.last_synced_at,
        totalIssues: count || 0,
        hasIntegration: true,
      });
    } catch (error) {
      console.error('Error fetching sync stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      console.log('Starting Jira sync...');
      const response = await fetch('/api/jira/sync', {
        method: 'POST',
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        console.error('Non-JSON response:', textResponse.substring(0, 500));
        alert(`Sync failed: Server returned ${response.status} error. Check console for details.`);
        return;
      }

      const result = await response.json();

      if (response.ok) {
        console.log('✅ Jira sync complete:', result);

        // Show success message
        const message = `Synced ${result.issuesStored || 0} issues, created ${result.totalLinksCreated || 0} theme links`;
        setSyncResult(message);
        setTimeout(() => setSyncResult(null), 5000); // Hide after 5 seconds

        // Wait longer for database to propagate changes
        console.log('Waiting 2 seconds for database propagation...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Fetching updated sync stats...');
        const beforeLastSynced = syncStats.lastSynced;
        await fetchSyncStats(); // Refresh stats after sync
        console.log('Stats refresh complete. Before:', beforeLastSynced, 'After: will update on next render');
      } else {
        console.error('❌ Jira sync failed:', result);
        alert(`Sync failed: ${result.error || 'Unknown error'}\n${result.details || ''}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert(`Sync error: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setSyncing(false);
    }
  }

  if (loading || !syncStats.hasIntegration) {
    return null; // Don't show button if not connected
  }

  const lastSyncedText = syncStats.lastSynced
    ? new Date(syncStats.lastSynced).toLocaleString()
    : 'Never';

  // Calculate time ago for compact display
  const timeAgo = syncStats.lastSynced
    ? (() => {
        const diffMs = Date.now() - new Date(syncStats.lastSynced).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) return `${diffDays}d ago`;
        if (diffHours > 0) return `${diffHours}h ago`;
        if (diffMins > 0) return `${diffMins}m ago`;
        return 'just now';
      })()
    : 'never';

  return (
    <div className="relative">
      <div className="space-y-2">
        <button
          onClick={syncNow}
          disabled={syncing}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="flex flex-col items-start px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing Jira...' : 'Sync Jira'}</span>
          </div>
          {!syncing && (
            <span className="text-xs text-purple-600 mt-0.5 ml-6">
              Last synced {timeAgo}
            </span>
          )}
        </button>

        {syncResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <p className="text-xs text-green-800">{syncResult}</p>
          </div>
        )}
      </div>

      {/* Hover Tooltip */}
      {showTooltip && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Jira Integration</h4>
              <p className="text-xs text-gray-600">
                Automated daily sync at 3:00 AM UTC via Supabase cron job
              </p>
            </div>

            <div className="pt-3 border-t border-gray-200 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Last synced:</span>
                <span className="font-medium text-gray-900">{lastSyncedText}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Total issues (90d):</span>
                <span className="font-medium text-gray-900">
                  {syncStats.totalIssues.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Issues are automatically synced and linked to friction themes based on keywords and labels.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
