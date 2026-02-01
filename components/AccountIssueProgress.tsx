'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CheckCircle2, Rocket, AlertCircle, TrendingUp } from 'lucide-react';

interface ProgressData {
  total_issues: number;
  fixed: number;
  in_progress: number;
  open: number;
  fix_rate_30d: number;
}

export default function AccountIssueProgress({ accountId }: { accountId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProgressData | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchProgress();
  }, [accountId]);

  async function fetchProgress() {
    try {
      const response = await fetch(`/api/accounts/${accountId}/issue-progress`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch issue progress:', error);
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

  if (!data || data.total_issues === 0) {
    return null;
  }

  const remaining = data.open + data.in_progress;
  const percentFixed = ((data.fixed / data.total_issues) * 100).toFixed(0);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Issue Resolution Progress</h3>
        <p className="text-sm text-gray-600">
          Your team's progress fixing customer-reported issues
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-gray-600" />
            <span className="text-xs font-medium text-gray-700">Total Issues</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{data.total_issues}</div>
          <div className="text-xs text-gray-600 mt-1">Customer-reported</div>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-green-700">Fixed</span>
          </div>
          <div className="text-2xl font-bold text-green-900">{data.fixed}</div>
          <div className="text-xs text-green-600 mt-1">{percentFixed}% resolved</div>
        </div>

        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-700">In Progress</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">{data.in_progress}</div>
          <div className="text-xs text-blue-600 mt-1">Being worked on</div>
        </div>

        <div className="bg-orange-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-medium text-orange-700">Remaining</span>
          </div>
          <div className="text-2xl font-bold text-orange-900">{remaining}</div>
          <div className="text-xs text-orange-600 mt-1">To be addressed</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Resolution Rate</span>
          <span className="text-sm text-gray-600">{percentFixed}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${percentFixed}%` }}
          ></div>
        </div>
      </div>

      {/* 30-Day Trend */}
      {data.fix_rate_30d > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-green-600" />
          <span className="text-gray-700">
            <span className="font-semibold text-green-700">{data.fix_rate_30d}</span> issues fixed in last 30 days
          </span>
        </div>
      )}
    </div>
  );
}
