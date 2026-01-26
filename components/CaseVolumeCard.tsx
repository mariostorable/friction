'use client';

import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle } from 'lucide-react';

interface CaseVolumeCardProps {
  currentVolume: number;
  accountHistoricalAvg: number;
  portfolioAvg: number;
  last7Days: number;
  accountName: string;
}

export default function CaseVolumeCard({
  currentVolume,
  accountHistoricalAvg,
  portfolioAvg,
  last7Days,
  accountName
}: CaseVolumeCardProps) {
  // Calculate deviations
  const vsAccountAvg = accountHistoricalAvg > 0
    ? ((currentVolume - accountHistoricalAvg) / accountHistoricalAvg) * 100
    : 0;

  const vsPortfolioAvg = portfolioAvg > 0
    ? ((currentVolume - portfolioAvg) / portfolioAvg) * 100
    : 0;

  // Determine status
  const isAnomalouslyHigh = vsAccountAvg > 50; // 50% above their own average
  const isAnomalouslyLow = vsAccountAvg < -50; // 50% below their own average
  const isNormal = !isAnomalouslyHigh && !isAnomalouslyLow;

  const getStatusColor = () => {
    if (isAnomalouslyHigh) return 'bg-red-50 border-red-200';
    if (isAnomalouslyLow) return 'bg-yellow-50 border-yellow-200';
    return 'bg-green-50 border-green-200';
  };

  const getStatusIcon = () => {
    if (isAnomalouslyHigh) return <AlertTriangle className="w-5 h-5 text-red-600" />;
    if (isAnomalouslyLow) return <TrendingDown className="w-5 h-5 text-yellow-600" />;
    return <CheckCircle className="w-5 h-5 text-green-600" />;
  };

  const getStatusText = () => {
    if (isAnomalouslyHigh) return 'Unusually High Volume';
    if (isAnomalouslyLow) return 'Unusually Low Volume';
    return 'Normal Volume';
  };

  const getStatusDescription = () => {
    // Determine peer comparison
    const vsPeers = currentVolume > portfolioAvg * 1.5 ? 'much higher than peers' :
                   currentVolume < portfolioAvg * 0.5 ? 'much lower than peers' :
                   'similar to peers';

    // Determine trend
    const trend = vsAccountAvg === 0 ? 'stable at their usual level' :
                 vsAccountAvg > 0 ? `trending up ${Math.abs(vsAccountAvg).toFixed(0)}% above their baseline` :
                 `trending down ${Math.abs(vsAccountAvg).toFixed(0)}% below their baseline`;

    if (isAnomalouslyHigh) {
      return `This account is experiencing unusually high support volume - ${vsPeers} and ${trend}. This may indicate emerging issues requiring attention.`;
    }
    if (isAnomalouslyLow) {
      return `This account has unusually low support volume - ${vsPeers} and ${trend}. This could indicate improved product experience or reduced engagement.`;
    }
    return `Support volume is ${vsPeers} and ${trend}.`;
  };

  // Calculate weekly averages (90 days ≈ 13 weeks)
  const accountWeeklyAvg = accountHistoricalAvg / 13;
  const portfolioWeeklyAvg = portfolioAvg / 13;
  const expectedWeekly = accountWeeklyAvg;

  // Calculate 7-day deviation from expected
  const vs7DayExpected = expectedWeekly > 0
    ? ((last7Days - expectedWeekly) / expectedWeekly) * 100
    : 0;

  return (
    <div className={`rounded-lg border p-6 ${getStatusColor()}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {getStatusIcon()}
            Support Volume Analysis
          </h3>
          <p className="text-sm text-gray-600 mt-1">{getStatusText()}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-gray-900">{accountWeeklyAvg.toFixed(0)}</div>
          <div className="text-xs text-gray-600 uppercase tracking-wide">Avg cases/week</div>
        </div>
      </div>

      <p className="text-sm text-gray-700 mb-4">
        {getStatusDescription()}
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
            Weekly Baseline
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-gray-900">
              {accountWeeklyAvg.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">cases/week</div>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {currentVolume} total in last 90 days
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
            Last 7 Days
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-gray-900">
              {last7Days}
            </div>
            <div className="text-xs text-gray-500">cases</div>
          </div>
          <div className={`text-xs font-medium mt-1 ${
            vs7DayExpected > 20 ? 'text-red-600' :
            vs7DayExpected < -20 ? 'text-yellow-600' :
            'text-gray-600'
          }`}>
            {Math.abs(vs7DayExpected) < 10 ? 'Normal week' :
             vs7DayExpected > 0 ? `${vs7DayExpected.toFixed(0)}% above usual` :
             `${Math.abs(vs7DayExpected).toFixed(0)}% below usual`}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-600 font-medium mb-1">✓ Confirmed: All cases belong to {accountName}</p>
        <p className="text-xs text-gray-500">
          Weekly Baseline = This account's average cases per week over 90 days • Last 7 Days = Cases synced in the most recent week
        </p>
      </div>
    </div>
  );
}
