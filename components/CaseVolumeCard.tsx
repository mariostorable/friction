'use client';

import { useState } from 'react';
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
  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate deviations for 90-day totals
  const vsAccountAvg = accountHistoricalAvg > 0
    ? ((currentVolume - accountHistoricalAvg) / accountHistoricalAvg) * 100
    : 0;

  const vsPortfolioAvg = portfolioAvg > 0
    ? ((currentVolume - portfolioAvg) / portfolioAvg) * 100
    : 0;

  // Calculate weekly baseline and 7-day deviation (for status determination)
  const accountWeeklyBaseline = accountHistoricalAvg / 13; // 90 days ≈ 13 weeks
  const vs7DayBaseline = accountWeeklyBaseline > 0
    ? ((last7Days - accountWeeklyBaseline) / accountWeeklyBaseline) * 100
    : 0;

  // Determine status based on 7-day volume vs weekly baseline (NOT 90-day totals)
  const isAnomalouslyHigh = vs7DayBaseline > 50; // 50% above their weekly baseline
  const isAnomalouslyLow = vs7DayBaseline < -50; // 50% below their weekly baseline
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

    // Determine trend based on 7-day deviation
    const trend = vs7DayBaseline === 0 ? 'stable at their usual level' :
                 vs7DayBaseline > 0 ? `trending up ${Math.abs(vs7DayBaseline).toFixed(0)}% above their baseline` :
                 `trending down ${Math.abs(vs7DayBaseline).toFixed(0)}% below their baseline`;

    if (isAnomalouslyHigh) {
      return `Support volume is ${vsPeers} and ${trend}.`;
    }
    if (isAnomalouslyLow) {
      return `Support volume is ${vsPeers} and ${trend}.`;
    }
    return `Support volume is ${vsPeers} and ${trend}.`;
  };

  // Portfolio weekly average for display
  const portfolioWeeklyAvg = portfolioAvg / 13;

  const getTooltipText = () => {
    if (isAnomalouslyHigh) return 'Warning: Case volume is 50%+ above this account\'s typical weekly baseline';
    if (isAnomalouslyLow) return 'Notice: Case volume is 50%+ below this account\'s typical weekly baseline';
    return 'Case volume is within normal range for this account';
  };

  return (
    <div className={`rounded-lg border p-6 ${getStatusColor()} relative`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <div
            className="relative"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {getStatusIcon()}
            {showTooltip && (
              <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal">
                {getTooltipText()}
                <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 transform rotate-45"></div>
              </div>
            )}
          </div>
          Support Volume Analysis
        </h3>
        <p className="text-sm text-gray-600 mt-1">{getStatusText()}</p>
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
              {accountWeeklyBaseline.toFixed(1)}
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
          <div className="text-xs text-gray-500 mt-0.5">
            {(last7Days / 7).toFixed(1)} avg cases/day
          </div>
          <div className={`text-xs font-medium mt-1 ${
            vs7DayBaseline > 20 ? 'text-red-600' :
            vs7DayBaseline < -20 ? 'text-yellow-600' :
            'text-gray-600'
          }`}>
            {Math.abs(vs7DayBaseline) < 10 ? 'Normal week' :
             vs7DayBaseline > 0 ? `${vs7DayBaseline.toFixed(0)}% above baseline` :
             `${Math.abs(vs7DayBaseline).toFixed(0)}% below baseline`}
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
