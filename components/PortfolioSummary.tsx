'use client';

import { AccountWithMetrics } from '@/types';
import { TrendingUp, TrendingDown, AlertCircle, Activity, BarChart3, Info, X } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PortfolioSummaryProps {
  top25: AccountWithMetrics[];
  singleOperator: AccountWithMetrics[];
}

export default function PortfolioSummary({ top25, singleOperator }: PortfolioSummaryProps) {
  const [showFrictionTooltip, setShowFrictionTooltip] = useState(false);
  const [showAbnormalVolumeModal, setShowAbnormalVolumeModal] = useState(false);
  const [showActiveAlertsModal, setShowActiveAlertsModal] = useState(false);
  const [hoveredStat, setHoveredStat] = useState<string | null>(null);
  const router = useRouter();

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

  // Get list of accounts with alerts
  const accountsWithAlerts = allAccounts
    .filter(acc => (acc.alert_count || 0) > 0)
    .sort((a, b) => (b.alert_count || 0) - (a.alert_count || 0));

  // Calculate case volume anomalies
  const accountsWithVolume = allAccounts.filter(acc => acc.current_snapshot?.case_volume !== undefined);
  const avgCaseVolume = accountsWithVolume.length > 0
    ? accountsWithVolume.reduce((sum, acc) => sum + (acc.current_snapshot?.case_volume || 0), 0) / accountsWithVolume.length
    : 0;

  const abnormalVolumeAccountsList = accountsWithVolume.filter(acc => {
    const volume = acc.current_snapshot?.case_volume || 0;
    return volume > avgCaseVolume * 1.5 || volume < avgCaseVolume * 0.5;
  }).map(acc => {
    const volume = acc.current_snapshot?.case_volume || 0;
    const percentDiff = avgCaseVolume > 0 ? ((volume - avgCaseVolume) / avgCaseVolume) * 100 : 0;
    return {
      ...acc,
      reason: volume > avgCaseVolume * 1.5 ? 'high' : 'low',
      percentDiff: Math.round(percentDiff)
    };
  }).sort((a, b) => Math.abs(b.percentDiff) - Math.abs(a.percentDiff));

  const abnormalVolumeAccounts = abnormalVolumeAccountsList.length;

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
      subtext: `${trendingUp} worsening`,
      tooltip: 'Accounts where OFI score is increasing (friction getting worse over time)',
    },
    {
      name: 'Trending Down',
      value: trendingDown,
      icon: TrendingDown,
      color: 'text-green-600',
      bg: 'bg-green-50',
      subtext: `${trendingDown} improving`,
      tooltip: 'Accounts where OFI score is decreasing (friction improving over time)',
    },
    {
      name: 'Active Alerts',
      value: totalAlerts,
      icon: AlertCircle,
      color: totalAlerts > 0 ? 'text-yellow-600' : 'text-gray-600',
      bg: totalAlerts > 0 ? 'bg-yellow-50' : 'bg-gray-50',
      subtext: totalAlerts > 0 ? `${totalAlerts} active` : 'None active',
      tooltip: 'Automated alerts for: High Friction (OFI ≥ 70), Critical Issues (3+ high-severity cases), and Abnormal Volume Spikes. Alerts expire after 7 days.',
    },
    {
      name: 'Abnormal Volume',
      value: abnormalVolumeAccounts,
      icon: BarChart3,
      color: abnormalVolumeAccounts > 0 ? 'text-orange-600' : 'text-gray-600',
      bg: abnormalVolumeAccounts > 0 ? 'bg-orange-50' : 'bg-gray-50',
      subtext: `${abnormalVolumeAccounts} accounts`,
      tooltip: 'Accounts with case volumes 50%+ higher or lower than portfolio average',
    },
  ];

  return (
    <>
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-8">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const isFrictionScore = stat.name === 'Avg. Friction Score';
        const isAbnormalVolume = stat.name === 'Abnormal Volume';
        const isActiveAlerts = stat.name === 'Active Alerts';
        const isClickable = (isAbnormalVolume && abnormalVolumeAccountsList.length > 0) || (isActiveAlerts && totalAlerts > 0);

        return (
          <div
            key={stat.name}
            className={`bg-white rounded-lg border border-gray-200 relative ${isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
            style={{ overflow: 'visible' }}
            onClick={() => {
              if (isAbnormalVolume && abnormalVolumeAccountsList.length > 0) {
                setShowAbnormalVolumeModal(true);
              }
              if (isActiveAlerts && totalAlerts > 0) {
                setShowActiveAlertsModal(true);
              }
            }}
            onMouseEnter={() => setHoveredStat(stat.name)}
            onMouseLeave={() => setHoveredStat(null)}
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 ${stat.bg} rounded-md p-3`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} aria-hidden="true" />
                </div>
                <div className="ml-5 flex-1 min-w-0">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
                      {stat.name}
                      {isFrictionScore && (
                        <div className="relative inline-block">
                          <button
                            onMouseEnter={() => setShowFrictionTooltip(true)}
                            onMouseLeave={() => setShowFrictionTooltip(false)}
                            className="text-blue-400 hover:text-blue-600 transition-colors cursor-help p-0.5"
                            aria-label="Show OFI calculation details"
                            type="button"
                          >
                            <Info className="w-4 h-4" />
                          </button>

                          {/* Tooltip */}
                          {showFrictionTooltip && (
                            <div
                              className="absolute left-0 top-6 w-80 bg-white border border-gray-300 rounded-lg shadow-2xl p-4 z-[9999]"
                              onMouseEnter={() => setShowFrictionTooltip(true)}
                              onMouseLeave={() => setShowFrictionTooltip(false)}
                            >
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">OFI Score Calculation</h4>
                              <div className="text-xs text-gray-600 space-y-2">
                                <p className="font-medium">The Operational Friction Index (0-100) measures customer friction based on:</p>
                                <ul className="space-y-1 ml-3">
                                  <li>• <strong>Severity weights:</strong> Issues are weighted 1-8 based on severity (1-5)</li>
                                  <li>• <strong>Base score:</strong> Logarithmic scale of weighted issues prevents easy maxing out</li>
                                  <li>• <strong>Friction density:</strong> Percentage of cases with friction (0.5x-1.5x multiplier)</li>
                                  <li>• <strong>High severity boost:</strong> Critical issues (severity 4-5) add bonus points</li>
                                </ul>
                                <div className="pt-2 mt-2 border-t border-gray-100">
                                  <p className="text-xs italic text-gray-500">
                                    <strong>Scores:</strong> 70+ = High Friction, 40-69 = Medium, 0-39 = Low
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </dt>
                    <dd className="flex items-baseline flex-wrap gap-1">
                      <div className={`text-2xl font-semibold ${stat.color}`}>
                        {stat.value}
                      </div>
                      {stat.subtext && (
                        <div className="text-xs text-gray-500 whitespace-nowrap">
                          {stat.subtext}
                        </div>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            {/* Tooltip */}
            {stat.tooltip && hoveredStat === stat.name && (
              <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50">
                {stat.tooltip}
                <div className="absolute -top-1 left-6 w-2 h-2 bg-gray-900 transform rotate-45"></div>
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* Active Alerts Modal */}
    {showActiveAlertsModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowActiveAlertsModal(false)}>
        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Active Alerts</h2>
              <p className="text-sm text-gray-600 mt-1">
                Accounts with active alerts requiring attention
              </p>
            </div>
            <button
              onClick={() => setShowActiveAlertsModal(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
            <div className="space-y-4">
              {accountsWithAlerts.map((account) => (
                <div
                  key={account.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    setShowActiveAlertsModal(false);
                    router.push(`/account/${account.id}`);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{account.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        ${(account.arr || 0).toLocaleString()} ARR • {account.products || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-yellow-600">
                        {account.alert_count || 0}
                      </div>
                      <div className="text-sm text-gray-600">active {account.alert_count === 1 ? 'alert' : 'alerts'}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      ⚠️ Needs Attention
                    </span>
                    {account.current_snapshot?.ofi_score && (
                      <span className="text-sm text-gray-600">
                        OFI Score: {account.current_snapshot.ofi_score}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Abnormal Volume Modal */}
    {showAbnormalVolumeModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowAbnormalVolumeModal(false)}>
        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Abnormal Case Volume Accounts</h2>
              <p className="text-sm text-gray-600 mt-1">
                Accounts with case volumes significantly higher or lower than portfolio average ({Math.round(avgCaseVolume)} cases)
              </p>
            </div>
            <button
              onClick={() => setShowAbnormalVolumeModal(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
            <div className="space-y-4">
              {abnormalVolumeAccountsList.map((account) => (
                <div
                  key={account.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    setShowAbnormalVolumeModal(false);
                    router.push(`/account/${account.id}`);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{account.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        ${(account.arr || 0).toLocaleString()} ARR • {account.products || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <div className={`text-2xl font-bold ${account.reason === 'high' ? 'text-red-600' : 'text-yellow-600'}`}>
                        {account.current_snapshot?.case_volume || 0}
                      </div>
                      <div className="text-sm text-gray-600">cases (90d)</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      account.reason === 'high'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {account.reason === 'high' ? '⚠️ High Volume' : '⬇️ Low Volume'}
                    </span>
                    <span className="text-sm text-gray-600">
                      {account.percentDiff > 0 ? '+' : ''}{account.percentDiff}% vs portfolio avg
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
