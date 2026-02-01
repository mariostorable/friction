'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface ThemeLinkStats {
  theme_key: string;
  ticket_count: number;
  resolved: number;
  in_progress: number;
  open: number;
}

export default function JiraLinksDiagnostic() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ThemeLinkStats[]>([]);
  const [totalIssues, setTotalIssues] = useState(0);
  const [totalLinks, setTotalLinks] = useState(0);
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  async function fetchDiagnostics() {
    try {
      // Get theme link stats
      const { data: themeStats } = await supabase.rpc('get_theme_link_stats');

      // Get total counts
      const { count: issueCount } = await supabase
        .from('jira_issues')
        .select('*', { count: 'exact', head: true });

      const { count: linkCount } = await supabase
        .from('theme_jira_links')
        .select('*', { count: 'exact', head: true });

      setStats(themeStats || []);
      setTotalIssues(issueCount || 0);
      setTotalLinks(linkCount || 0);
    } catch (error) {
      console.error('Error fetching diagnostics:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Jira Theme Links Diagnostic</h3>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-sm text-blue-700 font-medium mb-1">Total Jira Issues</div>
          <div className="text-3xl font-bold text-blue-900">{totalIssues}</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-sm text-purple-700 font-medium mb-1">Total Theme Links</div>
          <div className="text-3xl font-bold text-purple-900">{totalLinks}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-sm text-green-700 font-medium mb-1">Themes with Tickets</div>
          <div className="text-3xl font-bold text-green-900">{stats.length}</div>
        </div>
      </div>

      {stats.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>No Jira tickets are linked to any themes.</strong>
            <br />
            This means the keyword/label matching isn't finding any matches between your Jira tickets and friction themes.
          </p>
        </div>
      )}

      {stats.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Tickets per Theme:</h4>
          {stats.map(stat => (
            <div key={stat.theme_key} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
              <span className="text-sm font-medium text-gray-900">{stat.theme_key}</span>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">Total: {stat.ticket_count}</span>
                <span className="text-green-700">✓ {stat.resolved}</span>
                <span className="text-blue-700">◐ {stat.in_progress}</span>
                <span className="text-gray-600">○ {stat.open}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
