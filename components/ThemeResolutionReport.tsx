'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CheckCircle, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';

interface ThemeResolutionData {
  theme_key: string;
  theme_label: string;
  friction_count: number;
  jira_todo: number;
  jira_in_progress: number;
  jira_done: number;
  status: 'addressed' | 'partially_addressed' | 'unaddressed';
  jira_issues: Array<{ jira_key: string; issue_url: string; status: string }>;
}

export default function ThemeResolutionReport() {
  const [data, setData] = useState<ThemeResolutionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unaddressed' | 'addressed'>('all');
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch all friction cards grouped by theme
      const { data: frictionCards } = await supabase
        .from('friction_cards')
        .select('theme_key')
        .eq('user_id', user.id);

      // Count friction by theme
      const themeCounts: Record<string, number> = {};
      frictionCards?.forEach((card: any) => {
        themeCounts[card.theme_key] = (themeCounts[card.theme_key] || 0) + 1;
      });

      // Fetch Jira links with issue details
      const { data: jiraLinks } = await supabase
        .from('theme_jira_links')
        .select(`
          theme_key,
          jira_issue:jira_issues(id, jira_key, issue_url, status)
        `)
        .eq('user_id', user.id);

      // Aggregate Jira status by theme
      const jiraStatus: Record<string, {
        todo: number;
        in_progress: number;
        done: number;
        issues: Array<{ jira_key: string; issue_url: string; status: string }>;
      }> = {};

      jiraLinks?.forEach((link: any) => {
        const theme = link.theme_key;
        if (!jiraStatus[theme]) {
          jiraStatus[theme] = { todo: 0, in_progress: 0, done: 0, issues: [] };
        }

        const issue = link.jira_issue;
        const status = issue.status.toLowerCase();

        if (status.includes('done') || status.includes('closed') || status.includes('resolved')) {
          jiraStatus[theme].done++;
        } else if (status.includes('progress') || status.includes('review') || status.includes('development')) {
          jiraStatus[theme].in_progress++;
        } else {
          jiraStatus[theme].todo++;
        }

        jiraStatus[theme].issues.push({
          jira_key: issue.jira_key,
          issue_url: issue.issue_url,
          status: issue.status,
        });
      });

      // Build report data
      const reportData: ThemeResolutionData[] = Object.entries(themeCounts).map(([themeKey, count]) => {
        const jira = jiraStatus[themeKey] || { todo: 0, in_progress: 0, done: 0, issues: [] };
        const totalTickets = jira.todo + jira.in_progress + jira.done;

        let status: 'addressed' | 'partially_addressed' | 'unaddressed';
        if (totalTickets === 0) {
          status = 'unaddressed';
        } else if (jira.in_progress > 0 || jira.done > 0) {
          status = 'addressed';
        } else {
          status = 'partially_addressed';
        }

        return {
          theme_key: themeKey,
          theme_label: formatThemeLabel(themeKey),
          friction_count: count,
          jira_todo: jira.todo,
          jira_in_progress: jira.in_progress,
          jira_done: jira.done,
          status,
          jira_issues: jira.issues,
        };
      });

      // Sort by friction count (highest first)
      reportData.sort((a, b) => b.friction_count - a.friction_count);

      setData(reportData);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatThemeLabel(key: string): string {
    return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  const filteredData = data.filter(row => {
    if (filter === 'all') return true;
    if (filter === 'unaddressed') return row.status === 'unaddressed';
    if (filter === 'addressed') return row.status === 'addressed' || row.status === 'partially_addressed';
    return true;
  });

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Theme Resolution Status</h2>
          <p className="text-sm text-gray-600 mt-1">
            Track which friction themes are being addressed in Jira
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unaddressed')}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              filter === 'unaddressed' ? 'bg-yellow-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Unaddressed
          </button>
          <button
            onClick={() => setFilter('addressed')}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              filter === 'addressed' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Addressed
          </button>
        </div>
      </div>

      {filteredData.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {data.length === 0
              ? 'No friction themes found. Sync your Salesforce cases first.'
              : 'No themes match the selected filter.'}
          </p>
        </div>
      )}

      {filteredData.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Theme
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Friction Count
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  To Do
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  In Progress
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Done
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jira Tickets
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((row) => (
                <tr key={row.theme_key} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {row.theme_label}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {row.friction_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {row.jira_todo}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={row.jira_in_progress > 0 ? 'text-blue-600 font-medium' : 'text-gray-600'}>
                      {row.jira_in_progress}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={row.jira_done > 0 ? 'text-green-600 font-medium' : 'text-gray-600'}>
                      {row.jira_done}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.status === 'addressed' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3" />
                        Addressed
                      </span>
                    )}
                    {row.status === 'partially_addressed' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <AlertTriangle className="w-3 h-3" />
                        Partial
                      </span>
                    )}
                    {row.status === 'unaddressed' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle className="w-3 h-3" />
                        Unaddressed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {row.jira_issues.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.jira_issues.slice(0, 3).map((issue) => (
                          <a
                            key={issue.jira_key}
                            href={issue.issue_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100 transition-colors"
                          >
                            {issue.jira_key}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                        {row.jira_issues.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{row.jira_issues.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No tickets</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredData.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
          <p>
            <strong>Summary:</strong> {filteredData.filter(r => r.status === 'unaddressed').length} unaddressed themes,{' '}
            {filteredData.filter(r => r.status === 'addressed').length} addressed themes
          </p>
        </div>
      )}
    </div>
  );
}
