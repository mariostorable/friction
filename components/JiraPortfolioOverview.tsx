'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CheckCircle2, Rocket, Clock, TrendingUp } from 'lucide-react';

interface PortfolioStats {
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
  issue_url: string;
  affected_accounts: Array<{ id: string; name: string; arr: number }>;
  impact_score: number;
}

interface JiraPortfolioData {
  portfolio: PortfolioStats;
  topThemes: TopTheme[];
  accountsByIssue: SharedIssue[];
}

export default function JiraPortfolioOverview() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<JiraPortfolioData | null>(null);
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

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Jira Roadmap Progress</h3>
        <p className="text-sm text-gray-600">
          Product fixes and improvements across your Top 25 accounts
        </p>
      </div>

      {/* Portfolio Stats - Clickable Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-green-700">Resolved (30d)</span>
          </div>
          <div className="text-2xl font-bold text-green-900">{data.portfolio.resolved_30d}</div>
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

      {/* Call to Action */}
      <div className="mt-4 text-center">
        <button
          onClick={() => window.location.href = '/dashboard?tab=themes'}
          className="text-sm text-purple-700 hover:text-purple-900 font-medium"
        >
          View all themes and roadmap details →
        </button>
      </div>
    </div>
  );
}
