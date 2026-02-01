'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RefreshCw, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

export default function JiraSyncCard() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
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

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!syncStats.hasIntegration) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Jira Sync
            </h3>
            <p className="text-sm text-gray-600">
              Connect Jira in Settings to start syncing issues
            </p>
          </div>
        </div>
      </div>
    );
  }

  const lastSyncedText = syncStats.lastSynced
    ? new Date(syncStats.lastSynced).toLocaleString()
    : 'Never';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Jira Sync
          </h3>
          <p className="text-sm text-gray-600">
            Automated daily sync at 3:00 AM UTC
          </p>
        </div>
        <button
          onClick={syncNow}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-gray-600">Last synced:</span>
          <span className="font-medium text-gray-900">{lastSyncedText}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span className="text-gray-600">Total issues (90 days):</span>
          <span className="font-medium text-gray-900">
            {syncStats.totalIssues.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Issues are automatically synced daily and linked to friction themes based on keywords and labels.
        </p>
      </div>
    </div>
  );
}
