'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CheckCircle2, Rocket, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PortfolioStats {
  resolved_7d: number;
  resolved_30d: number;
  resolved_90d: number;
  in_progress: number;
  open: number;
}

interface TopTheme {
  theme_key: string;
  case_count: number;
  account_count: number;
  avg_severity: number;
  ticket_count: number;
}

interface SharedIssue {
  jira_key: string;
  summary: string;
  status: string;
  affected_accounts: Array<{ id: string; name: string; arr: number }>;
  impact_score: number;
}

interface JiraPortfolioData {
  portfolio: PortfolioStats;
  topThemes: TopTheme[];
  accountsByIssue: SharedIssue[];
}

const THEME_LABELS: Record<string, string> = {
  'billing_confusion': 'Billing & Pricing',
  'integration_failures': 'Integrations',
  'ui_confusion': 'UI/UX Issues',
  'performance_issues': 'Performance',
  'missing_features': 'Missing Features',
  'training_gaps': 'Training',
  'support_response_time': 'Support Response',
  'data_quality': 'Data Quality',
  'reporting_issues': 'Reporting',
  'access_permissions': 'Access & Permissions',
  'configuration_problems': 'Configuration',
  'notification_issues': 'Notifications',
  'workflow_inefficiency': 'Workflow',
  'mobile_issues': 'Mobile',
};

export default function JiraPortfolioOverview() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<JiraPortfolioData | null>(null);
  const [activeView, setActiveView] = useState<'themes' | 'shared'>('themes');
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchPortfolioStats();
  }, []);

  async function fetchPortfolioStats() {
    try {
      const response = await fetch('/api/jira/portfolio-stats');
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch Jira portfolio stats:', error);
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

  if (!data || data.topThemes.length === 0) {
    return null; // Hide if no Jira data
  }

  const formatThemeLabel = (key: string) => THEME_LABELS[key] || key.replace(/_/g, ' ');

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Jira Portfolio Overview</h3>
        <p className="text-sm text-gray-600">
          Roadmap progress and shared issues across your Top 25 accounts
        </p>
      </div>

      {/* Portfolio Stats - Clickable Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-green-700">Resolved (7d)</span>
          </div>
          <div className="text-2xl font-bold text-green-900">{data.portfolio.resolved_7d}</div>
          <div className="text-xs text-green-600 mt-1">Quick wins</div>
        </div>

        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-700">In Progress</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">{data.portfolio.in_progress}</div>
          <div className="text-xs text-blue-600 mt-1">Coming soon</div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-gray-600" />
            <span className="text-xs font-medium text-gray-700">On Radar</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{data.portfolio.open}</div>
          <div className="text-xs text-gray-600 mt-1">Open tickets</div>
        </div>

        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-medium text-purple-700">30-Day Total</span>
          </div>
          <div className="text-2xl font-bold text-purple-900">{data.portfolio.resolved_30d}</div>
          <div className="text-xs text-purple-600 mt-1">Recently resolved</div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveView('themes')}
            className={`pb-2 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeView === 'themes'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Top Themes ({data.topThemes.length})
          </button>
          <button
            onClick={() => setActiveView('shared')}
            className={`pb-2 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeView === 'shared'
                ? 'border-orange-600 text-orange-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Shared Issues ({data.accountsByIssue.length})
          </button>
        </div>
      </div>

      {/* Top Themes View */}
      {activeView === 'themes' && (
        <div className="space-y-2">
          {data.topThemes.slice(0, 5).map((theme) => (
            <button
              key={theme.theme_key}
              onClick={() => router.push(`/dashboard?tab=themes&theme=${theme.theme_key}`)}
              className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left"
            >
              <div className="flex-1">
                <div className="font-medium text-gray-900">{formatThemeLabel(theme.theme_key)}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {theme.account_count} accounts • {theme.case_count} cases • {theme.ticket_count} tickets
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-white px-2 py-1 rounded border border-gray-200">
                  Avg severity: {theme.avg_severity.toFixed(1)}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Shared Issues View */}
      {activeView === 'shared' && (
        <div className="space-y-3">
          {data.accountsByIssue.slice(0, 5).map((issue) => (
            <div key={issue.jira_key} className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{issue.summary}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {issue.jira_key} • {issue.status}
                  </div>
                </div>
                <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded font-medium">
                  {issue.affected_accounts.length} accounts
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {issue.affected_accounts.slice(0, 3).map((account) => (
                  <button
                    key={account.id}
                    onClick={() => router.push(`/account/${account.id}`)}
                    className="text-xs bg-white hover:bg-gray-50 px-2 py-1 rounded border border-gray-200 transition-colors"
                  >
                    {account.name}
                  </button>
                ))}
                {issue.affected_accounts.length > 3 && (
                  <span className="text-xs text-gray-500 px-2 py-1">
                    +{issue.affected_accounts.length - 3} more
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
