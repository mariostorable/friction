'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CheckCircle2, Clock, AlertTriangle, Rocket, ExternalLink } from 'lucide-react';

interface JiraIssue {
  id: string;
  jira_key: string;
  summary: string;
  status: string;
  priority: string;
  assignee_name: string | null;
  resolution_date: string | null;
  issue_url: string;
  theme_key: string;
  theme_weight: number;
  case_count: number;
  resolved_days_ago?: number;
  time_period?: string;
}

interface ThemeToPrioritize {
  theme_key: string;
  case_count: number;
  avg_severity: number;
  weight: number;
  hasTicket: boolean;
}

interface JiraStatusData {
  recentlyResolved: JiraIssue[];
  onRadar: JiraIssue[];
  shouldPrioritize: ThemeToPrioritize[];
  comingSoon: JiraIssue[];
  summary: {
    resolved_7d: number;
    resolved_30d: number;
    resolved_90d: number;
    open_count: number;
    in_progress: number;
    needs_ticket: number;
  };
}

const THEME_LABELS: Record<string, string> = {
  'billing_confusion': 'Billing & Pricing',
  'integration_failures': 'Integrations',
  'ui_confusion': 'UI/UX Issues',
  'performance_issues': 'Performance',
  'missing_features': 'Missing Features',
  'training_gaps': 'Training & Documentation',
  'support_response_time': 'Support Response',
  'data_quality': 'Data Quality',
  'reporting_issues': 'Reporting',
  'access_permissions': 'Access & Permissions',
  'configuration_problems': 'Configuration',
  'notification_issues': 'Notifications',
  'workflow_inefficiency': 'Workflow Efficiency',
  'mobile_issues': 'Mobile Experience',
};

export default function AccountSupportRoadmap({ accountId }: { accountId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<JiraStatusData | null>(null);
  const [activeTab, setActiveTab] = useState<'resolved' | 'radar' | 'priority' | 'coming'>('resolved');

  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchJiraStatus();
  }, [accountId]);

  async function fetchJiraStatus() {
    try {
      const response = await fetch(`/api/accounts/${accountId}/jira-status`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch Jira status:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!data || (data.recentlyResolved.length === 0 && data.onRadar.length === 0 && data.shouldPrioritize.length === 0)) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Support & Roadmap</h3>
        <p className="text-sm text-gray-600">
          No Jira issues linked to this account's friction themes yet. Connect Jira in Settings to start tracking progress.
        </p>
      </div>
    );
  }

  const formatThemeLabel = (key: string) => THEME_LABELS[key] || key.replace(/_/g, ' ');

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Support & Roadmap</h3>
        <p className="text-sm text-gray-600">
          Jira ticket progress for this account's friction themes
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-green-700">Resolved (7d)</span>
          </div>
          <div className="text-2xl font-bold text-green-900">{data.summary.resolved_7d}</div>
        </div>

        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-700">In Progress</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">{data.summary.in_progress}</div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-gray-600" />
            <span className="text-xs font-medium text-gray-700">On Radar</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{data.summary.open_count}</div>
        </div>

        <div className="bg-amber-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-700">Needs Ticket</span>
          </div>
          <div className="text-2xl font-bold text-amber-900">{data.summary.needs_ticket}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('resolved')}
            className={`pb-2 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'resolved'
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Quick Wins ({data.recentlyResolved.length})
          </button>
          <button
            onClick={() => setActiveTab('coming')}
            className={`pb-2 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'coming'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Coming Soon ({data.comingSoon.length})
          </button>
          <button
            onClick={() => setActiveTab('radar')}
            className={`pb-2 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'radar'
                ? 'border-gray-600 text-gray-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            On Our Radar ({data.onRadar.length})
          </button>
          <button
            onClick={() => setActiveTab('priority')}
            className={`pb-2 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'priority'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Should Prioritize ({data.shouldPrioritize.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {activeTab === 'resolved' && (
          <>
            {data.recentlyResolved.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No tickets resolved recently</p>
            ) : (
              data.recentlyResolved.map((issue) => (
                <div key={issue.id} className="border border-green-200 rounded-lg p-3 bg-green-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <a
                          href={issue.issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-green-900 hover:underline flex items-center gap-1"
                        >
                          {issue.jira_key}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                          {issue.resolved_days_ago}d ago
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-1">{issue.summary}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="bg-white px-2 py-0.5 rounded border border-green-200">
                          {formatThemeLabel(issue.theme_key)}
                        </span>
                        <span>{issue.case_count} cases</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'coming' && (
          <>
            {data.comingSoon.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No tickets in progress</p>
            ) : (
              data.comingSoon.map((issue) => (
                <div key={issue.id} className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Rocket className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <a
                          href={issue.issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-blue-900 hover:underline flex items-center gap-1"
                        >
                          {issue.jira_key}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                          {issue.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-1">{issue.summary}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="bg-white px-2 py-0.5 rounded border border-blue-200">
                          {formatThemeLabel(issue.theme_key)}
                        </span>
                        <span>{issue.case_count} cases</span>
                        {issue.assignee_name && <span>• {issue.assignee_name}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'radar' && (
          <>
            {data.onRadar.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No open tickets</p>
            ) : (
              data.onRadar.map((issue) => (
                <div key={issue.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-gray-600 flex-shrink-0" />
                        <a
                          href={issue.issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-gray-900 hover:underline flex items-center gap-1"
                        >
                          {issue.jira_key}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                          {issue.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-1">{issue.summary}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="bg-white px-2 py-0.5 rounded border border-gray-200">
                          {formatThemeLabel(issue.theme_key)}
                        </span>
                        <span>{issue.case_count} cases</span>
                        {issue.priority && <span>• {issue.priority}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'priority' && (
          <>
            {data.shouldPrioritize.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">All friction themes have tickets</p>
            ) : (
              data.shouldPrioritize.map((theme) => (
                <div key={theme.theme_key} className="border border-amber-200 rounded-lg p-3 bg-amber-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className="text-sm font-medium text-amber-900">
                          {formatThemeLabel(theme.theme_key)}
                        </span>
                        <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                          No ticket
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-1">
                        High friction area with no roadmap item
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="bg-white px-2 py-0.5 rounded border border-amber-200">
                          {theme.case_count} cases
                        </span>
                        <span>Avg severity: {theme.avg_severity.toFixed(1)}</span>
                        <span>Impact score: {Math.round(theme.weight)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
