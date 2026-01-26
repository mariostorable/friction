'use client';

import { AccountWithMetrics } from '@/types';
import { TrendingUp, TrendingDown, AlertCircle, Activity, BarChart3 } from 'lucide-react';

interface PortfolioSummaryProps {
  top25: AccountWithMetrics[];
  singleOperator: AccountWithMetrics[];
}

export default function PortfolioSummary({ top25, singleOperator }: PortfolioSummaryProps) {
  const allAccounts = [...top25, ...singleOperator];
  
  const totalAccounts = allAccounts.length;
  const avgOfiScore = allAccounts.reduce((sum, acc) => 
    sum + (acc.current_snapshot?.ofi_score || 0), 0) / (totalAccounts || 1);
  
  const trendingUp = allAccounts.filter(acc => 
    acc.current_snapshot?.trend_direction === 'worsening').length;
  
  const trendingDown = allAccounts.filter(acc => 
    acc.current_snapshot?.trend_direction === 'improving').length;
  
  const totalAlerts = allAccounts.reduce((sum, acc) =>
    sum + (acc.alert_count || 0), 0);

  // Calculate case volume anomalies
  const accountsWithVolume = allAccounts.filter(acc => acc.current_snapshot?.case_volume !== undefined);
  const avgCaseVolume = accountsWithVolume.length > 0
    ? accountsWithVolume.reduce((sum, acc) => sum + (acc.current_snapshot?.case_volume || 0), 0) / accountsWithVolume.length
    : 0;

  const abnormalVolumeAccounts = accountsWithVolume.filter(acc => {
    const volume = acc.current_snapshot?.case_volume || 0;
    return volume > avgCaseVolume * 1.5 || volume < avgCaseVolume * 0.5;
  }).length;

  const stats = [
    {
      name: 'Total Accounts',
      value: totalAccounts,
      icon: Activity,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      name: 'Avg. Friction Score',
      value: avgOfiScore.toFixed(1),
      icon: Activity,
      color: avgOfiScore >= 50 ? 'text-red-600' : 'text-green-600',
      bg: avgOfiScore >= 50 ? 'bg-red-50' : 'bg-green-50',
    },
    {
      name: 'Trending Up',
      value: trendingUp,
      icon: TrendingUp,
      color: 'text-red-600',
      bg: 'bg-red-50',
      subtext: 'friction increasing',
    },
    {
      name: 'Trending Down',
      value: trendingDown,
      icon: TrendingDown,
      color: 'text-green-600',
      bg: 'bg-green-50',
      subtext: 'friction decreasing',
    },
    {
      name: 'Active Alerts',
      value: totalAlerts,
      icon: AlertCircle,
      color: totalAlerts > 0 ? 'text-yellow-600' : 'text-gray-600',
      bg: totalAlerts > 0 ? 'bg-yellow-50' : 'bg-gray-50',
    },
    {
      name: 'Abnormal Volume',
      value: abnormalVolumeAccounts,
      icon: BarChart3,
      color: abnormalVolumeAccounts > 0 ? 'text-orange-600' : 'text-gray-600',
      bg: abnormalVolumeAccounts > 0 ? 'bg-orange-50' : 'bg-gray-50',
      subtext: 'unusual case count',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.name} className="bg-white overflow-hidden rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 ${stat.bg} rounded-md p-3`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} aria-hidden="true" />
                </div>
                <div className="ml-5 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500">{stat.name}</dt>
                    <dd className="flex items-baseline">
                      <div className={`text-2xl font-semibold ${stat.color}`}>
                        {stat.value}
                      </div>
                      {stat.subtext && (
                        <div className="ml-2 text-xs text-gray-500">
                          {stat.subtext}
                        </div>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
