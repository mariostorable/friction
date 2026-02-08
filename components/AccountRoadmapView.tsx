'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CheckCircle2, Loader2, ExternalLink, Clock, Zap, ChevronDown, ChevronRight } from 'lucide-react';

interface JiraIssue {
  id: string;
  jira_key: string;
  summary: string;
  status: string;
  priority: string;
  resolution_date: string | null;
  updated_date: string;
  issue_url: string;
  theme_key: string;
}

interface AccountSummary {
  account_id: string;
  account_name: string;
  total_issues: number;
  resolved_count: number;
  in_progress_count: number;
  open_count: number;
  resolved: JiraIssue[];
  in_progress: JiraIssue[];
  open: JiraIssue[];
}

export default function AccountRoadmapView() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<'resolved' | 'in_progress' | 'open'>('in_progress');
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchAccountRoadmap();
  }, []);

  async function fetchAccountRoadmap() {
    try {
      const response = await fetch('/api/jira/roadmap-by-account');
      if (response.ok) {
        const result = await response.json();
        setAccounts(result.accounts || []);
      }
    } catch (error) {
      console.error('Failed to fetch account roadmap:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-2">No Jira tickets linked to accounts yet</p>
        <p className="text-sm text-gray-500">Sync Jira to see tickets organized by account</p>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    const p = priority?.toLowerCase() || '';
    if (p.includes('highest') || p.includes('critical')) return 'text-red-600 bg-red-50';
    if (p.includes('high')) return 'text-orange-600 bg-orange-50';
    if (p.includes('medium')) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const renderIssue = (issue: JiraIssue) => (
    <div key={issue.jira_key} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <a
              href={issue.issue_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-purple-700 hover:text-purple-900 flex items-center gap-1"
            >
              {issue.jira_key}
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor(issue.priority)}`}>
              {issue.priority}
            </span>
          </div>
          <p className="text-sm text-gray-900 line-clamp-2">{issue.summary}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{issue.status}</span>
            {issue.resolution_date && (
              <span className="text-xs text-green-600">
                Resolved {new Date(issue.resolution_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Product Roadmap by Account</h2>
        <p className="text-sm text-gray-600 mt-1">
          Jira tickets addressing friction for your top accounts
        </p>
      </div>

      {/* Account List */}
      <div className="space-y-3">
        {accounts.map((account) => {
          const isExpanded = expandedAccount === account.account_id;

          return (
            <div key={account.account_id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Account Header */}
              <button
                onClick={() => setExpandedAccount(isExpanded ? null : account.account_id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">{account.account_name}</h3>
                    <p className="text-sm text-gray-600">{account.total_issues} tickets</p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-3">
                  {account.resolved_count > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">{account.resolved_count}</span>
                    </div>
                  )}
                  {account.in_progress_count > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded">
                      <Zap className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">{account.in_progress_count}</span>
                    </div>
                  )}
                  {account.open_count > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded">
                      <Clock className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">{account.open_count}</span>
                    </div>
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-gray-200 bg-gray-50">
                  {/* Status Tabs */}
                  <div className="px-4 pt-3 border-b border-gray-200 bg-white">
                    <div className="flex gap-4">
                      <button
                        onClick={() => setExpandedStatus('resolved')}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                          expandedStatus === 'resolved'
                            ? 'border-green-600 text-green-700'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Resolved ({account.resolved_count})
                      </button>
                      <button
                        onClick={() => setExpandedStatus('in_progress')}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                          expandedStatus === 'in_progress'
                            ? 'border-blue-600 text-blue-700'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        In Progress ({account.in_progress_count})
                      </button>
                      <button
                        onClick={() => setExpandedStatus('open')}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                          expandedStatus === 'open'
                            ? 'border-gray-600 text-gray-700'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        On Radar ({account.open_count})
                      </button>
                    </div>
                  </div>

                  {/* Issue List */}
                  <div className="p-4 space-y-2">
                    {expandedStatus === 'resolved' && account.resolved.length > 0 && (
                      <div className="space-y-2">
                        {account.resolved.map(renderIssue)}
                      </div>
                    )}
                    {expandedStatus === 'in_progress' && account.in_progress.length > 0 && (
                      <div className="space-y-2">
                        {account.in_progress.map(renderIssue)}
                      </div>
                    )}
                    {expandedStatus === 'open' && account.open.length > 0 && (
                      <div className="space-y-2">
                        {account.open.map(renderIssue)}
                      </div>
                    )}

                    {/* Empty state for each tab */}
                    {expandedStatus === 'resolved' && account.resolved.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No resolved tickets in the last 7 days</p>
                    )}
                    {expandedStatus === 'in_progress' && account.in_progress.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No tickets in progress</p>
                    )}
                    {expandedStatus === 'open' && account.open.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No open tickets on radar</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
