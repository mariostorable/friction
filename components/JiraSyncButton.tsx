'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RefreshCw } from 'lucide-react';

export default function JiraSyncButton() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
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
      const response = await fetch('/api/jira/sync', {
        method: 'POST',
      });

      if (response.ok) {
        await fetchSyncStats(); // Refresh stats after sync
      }
    } catch (error) {
      console.error('Sync error:', error);
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

  return (
    <div className="relative">
      <button
        onClick={syncNow}
        disabled={syncing}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing Jira...' : 'Sync Jira'}
      </button>

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
