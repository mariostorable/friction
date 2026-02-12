'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Rocket, Clock, ExternalLink, Loader2 } from 'lucide-react';

interface JiraTicket {
  jira_key: string;
  summary: string;
  status: string;
  priority: string;
  issue_type: string;
  components: string[];
  resolution_date?: string;
  updated_date?: string;
  created_date?: string;
  issue_url: string;
  match_type: string;
}

interface JiraSummary {
  recentFixes: JiraTicket[];
  upcoming: {
    inProgress: JiraTicket[];
    open: JiraTicket[];
  };
  total: number;
  summary: {
    recentFixesCount: number;
    inProgressCount: number;
    openCount: number;
  };
}

export default function JiraRoadmapSummary({ accountId }: { accountId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<JiraSummary | null>(null);

  useEffect(() => {
    fetchJiraSummary();
  }, [accountId]);

  async function fetchJiraSummary() {
    try {
      const response = await fetch(`/api/accounts/${accountId}/jira-summary`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch Jira summary:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return null; // Hide if no Jira tickets
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getPriorityColor = (priority: string) => {
    const p = priority?.toLowerCase() || '';
    if (p.includes('critical')) return 'bg-red-100 text-red-800';
    if (p.includes('high') || p.includes('major')) return 'bg-orange-100 text-orange-800';
    if (p.includes('medium')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Recent Fixes */}
      {data.recentFixes.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-green-50 border-b border-green-200 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-semibold text-green-900">
                Recent Fixes ({data.summary.recentFixesCount})
              </h3>
            </div>
            <p className="text-sm text-green-700 mt-1">
              Product improvements rolled out in the last 30 days
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {data.recentFixes.slice(0, 10).map((ticket) => (
              <div key={ticket.jira_key} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <a
                        href={ticket.issue_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-purple-700 hover:text-purple-900 flex items-center gap-1"
                      >
                        {ticket.jira_key}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority || 'Medium'}
                      </span>
                      {ticket.components.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {ticket.components[0]}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900">{ticket.summary}</p>
                    {ticket.resolution_date && (
                      <p className="text-xs text-gray-500 mt-1">
                        ✓ Resolved {formatDate(ticket.resolution_date)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data.recentFixes.length > 10 && (
            <div className="bg-gray-50 px-4 py-3 text-center text-sm text-gray-600">
              +{data.recentFixes.length - 10} more fixes in the last 30 days
            </div>
          )}
        </div>
      )}

      {/* Upcoming Features */}
      {(data.upcoming.inProgress.length > 0 || data.upcoming.open.length > 0) && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-blue-50 border-b border-blue-200 p-4">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-blue-900">
                Upcoming Features ({data.summary.inProgressCount + data.summary.openCount})
              </h3>
            </div>
            <p className="text-sm text-blue-700 mt-1">
              Product improvements on the roadmap
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {/* In Progress */}
            {data.upcoming.inProgress.length > 0 && (
              <>
                <div className="bg-blue-50 px-4 py-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
                    <Rocket className="w-4 h-4" />
                    In Development ({data.upcoming.inProgress.length})
                  </div>
                </div>
                {data.upcoming.inProgress.slice(0, 5).map((ticket) => (
                  <div key={ticket.jira_key} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <a
                            href={ticket.issue_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-purple-700 hover:text-purple-900 flex items-center gap-1"
                          >
                            {ticket.jira_key}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityColor(ticket.priority)}`}>
                            {ticket.priority || 'Medium'}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                            {ticket.status}
                          </span>
                          {ticket.components.length > 0 && (
                            <span className="text-xs text-gray-500">
                              {ticket.components[0]}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900">{ticket.summary}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Open/Planned */}
            {data.upcoming.open.length > 0 && (
              <>
                <div className="bg-gray-50 px-4 py-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    <Clock className="w-4 h-4" />
                    Planned ({data.upcoming.open.length})
                  </div>
                </div>
                {data.upcoming.open.slice(0, 5).map((ticket) => (
                  <div key={ticket.jira_key} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <a
                            href={ticket.issue_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-purple-700 hover:text-purple-900 flex items-center gap-1"
                          >
                            {ticket.jira_key}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityColor(ticket.priority)}`}>
                            {ticket.priority || 'Medium'}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {ticket.status}
                          </span>
                          {ticket.components.length > 0 && (
                            <span className="text-xs text-gray-500">
                              {ticket.components[0]}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900">{ticket.summary}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {(data.upcoming.inProgress.length + data.upcoming.open.length) > 10 && (
            <div className="bg-gray-50 px-4 py-3 text-center text-sm text-gray-600">
              +{(data.upcoming.inProgress.length + data.upcoming.open.length) - 10} more items on the roadmap
            </div>
          )}
        </div>
      )}

      {/* Summary Stats */}
      {data.total > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-purple-900">
            <strong>Total Jira Visibility:</strong> {data.total} tickets linked to this account
            {data.summary.recentFixesCount > 0 && ` (${data.summary.recentFixesCount} fixed recently)`}
            {data.summary.inProgressCount > 0 && ` (${data.summary.inProgressCount} in progress)`}
          </p>
        </div>
      )}
    </div>
  );
}
