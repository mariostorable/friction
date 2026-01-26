'use client';

import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';

interface FrictionOverviewProps {
  accounts: any[];
}

export default function FrictionOverview({ accounts }: FrictionOverviewProps) {
  // Calculate stats
  const accountsWithScores = accounts.filter(a => a.current_snapshot?.ofi_score);
  const avgScore = accountsWithScores.length > 0 
    ? Math.round(accountsWithScores.reduce((sum, a) => sum + (a.current_snapshot?.ofi_score || 0), 0) / accountsWithScores.length)
    : 0;
  
  const lowFriction = accountsWithScores.filter(a => a.current_snapshot.ofi_score < 40).length;
  const moderateFriction = accountsWithScores.filter(a => a.current_snapshot.ofi_score >= 40 && a.current_snapshot.ofi_score < 70).length;
  const highFriction = accountsWithScores.filter(a => a.current_snapshot.ofi_score >= 70).length;

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-red-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return 'bg-red-50 border-red-200';
    if (score >= 40) return 'bg-yellow-50 border-yellow-200';
    return 'bg-green-50 border-green-200';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'High Friction - Action Needed';
    if (score >= 40) return 'Moderate Friction - Monitor';
    return 'Low Friction - Healthy';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Portfolio Friction Overview</h2>
      
      {/* Average Score */}
      <div className={`rounded-lg border-2 p-6 mb-6 ${getScoreBg(avgScore)}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">Average OFI Score</p>
            <p className={`text-5xl font-bold ${getScoreColor(avgScore)}`}>{avgScore}</p>
            <p className={`text-sm font-medium mt-2 ${getScoreColor(avgScore)}`}>
              {getScoreLabel(avgScore)}
            </p>
          </div>
          <div className={`${getScoreColor(avgScore)}`}>
            {avgScore >= 70 ? <AlertTriangle className="w-16 h-16" /> :
             avgScore >= 40 ? <AlertCircle className="w-16 h-16" /> :
             <CheckCircle className="w-16 h-16" />}
          </div>
        </div>
      </div>

      {/* Score Distribution */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-900">Low Friction</p>
          </div>
          <p className="text-3xl font-bold text-green-600">{lowFriction}</p>
          <p className="text-xs text-green-700 mt-1">Accounts with score 0-39</p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <p className="text-sm font-medium text-yellow-900">Moderate</p>
          </div>
          <p className="text-3xl font-bold text-yellow-600">{moderateFriction}</p>
          <p className="text-xs text-yellow-700 mt-1">Accounts with score 40-69</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <p className="text-sm font-medium text-red-900">High Friction</p>
          </div>
          <p className="text-3xl font-bold text-red-600">{highFriction}</p>
          <p className="text-xs text-red-700 mt-1">Accounts with score 70+</p>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <p className="text-xs font-semibold text-gray-700 mb-3">OFI Score Guide:</p>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div>
            <p className="font-medium text-green-700">🟢 0-39: Low Friction</p>
            <p className="text-gray-600">Healthy operations, minimal issues</p>
          </div>
          <div>
            <p className="font-medium text-yellow-700">🟡 40-69: Moderate</p>
            <p className="text-gray-600">Monitor closely, some concerns</p>
          </div>
          <div>
            <p className="font-medium text-red-700">🔴 70+: High Friction</p>
            <p className="text-gray-600">Immediate attention needed</p>
          </div>
        </div>
      </div>
    </div>
  );
}
