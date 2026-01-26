'use client';

import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';

interface PeerAccount {
  name: string;
  caseVolume: number;
  product: string;
}

interface PeerCaseComparisonProps {
  currentAccount: {
    name: string;
    caseVolume: number;
    product: string;
  };
  peers: PeerAccount[];
}

export default function PeerCaseComparison({ currentAccount, peers }: PeerCaseComparisonProps) {
  // Calculate statistics
  const sortedPeers = [...peers].sort((a, b) => b.caseVolume - a.caseVolume);
  const currentRank = sortedPeers.findIndex(p => p.name === currentAccount.name) + 1;

  const avgVolume = peers.reduce((sum, p) => sum + p.caseVolume, 0) / peers.length;
  const medianVolume = sortedPeers[Math.floor(sortedPeers.length / 2)].caseVolume;

  // Get product-specific peers
  const productPeers = peers.filter(p => p.product === currentAccount.product);
  const productAvg = productPeers.length > 0
    ? productPeers.reduce((sum, p) => sum + p.caseVolume, 0) / productPeers.length
    : avgVolume;

  // Find similar accounts (within 20% of current volume)
  const similarAccounts = sortedPeers.filter(p => {
    const diff = Math.abs(p.caseVolume - currentAccount.caseVolume);
    const percentDiff = (diff / currentAccount.caseVolume) * 100;
    return percentDiff <= 20 && p.name !== currentAccount.name;
  });

  const vsAvg = ((currentAccount.caseVolume - avgVolume) / avgVolume) * 100;
  const vsProductAvg = ((currentAccount.caseVolume - productAvg) / productAvg) * 100;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            Peer Comparison
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Case volume vs Top 25 accounts (last 90 days)
          </p>
        </div>
      </div>

      {/* Ranking Badge */}
      <div className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 font-medium">Portfolio Ranking</p>
            <p className="text-3xl font-bold text-gray-900">#{currentRank}</p>
            <p className="text-xs text-gray-500 mt-1">out of {peers.length} accounts</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600 mb-1">vs Portfolio Avg</p>
            <div className={`flex items-center gap-1 ${
              vsAvg > 0 ? 'text-red-600' : vsAvg < 0 ? 'text-green-600' : 'text-gray-600'
            }`}>
              {vsAvg > 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : vsAvg < 0 ? (
                <TrendingDown className="w-4 h-4" />
              ) : null}
              <span className="text-lg font-bold">
                {vsAvg > 0 ? '+' : ''}{vsAvg.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Portfolio Average */}
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">
            Portfolio Avg
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {avgVolume.toFixed(0)}
          </p>
          <p className="text-xs text-gray-500">cases/90d</p>
        </div>

        {/* Product Average */}
        <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-700 font-medium uppercase tracking-wide">
            {currentAccount.product} Avg
          </p>
          <p className="text-2xl font-bold text-blue-900 mt-1">
            {productAvg.toFixed(0)}
          </p>
          <p className="text-xs text-blue-600">
            {vsProductAvg > 0 ? '+' : ''}{vsProductAvg.toFixed(0)}% vs you
          </p>
        </div>

        {/* Median */}
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">
            Median
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {medianVolume}
          </p>
          <p className="text-xs text-gray-500">middle value</p>
        </div>
      </div>

      {/* Visual Distribution */}
      <div className="mb-4">
        <p className="text-xs text-gray-600 font-medium mb-2">CASE VOLUME DISTRIBUTION</p>
        <div className="relative h-24 bg-gray-100 rounded-lg p-2">
          {sortedPeers.slice(0, 10).map((peer, idx) => {
            const maxVolume = sortedPeers[0].caseVolume;
            const heightPercent = (peer.caseVolume / maxVolume) * 100;
            const isCurrentAccount = peer.name === currentAccount.name;

            return (
              <div
                key={peer.name}
                className="inline-block mx-0.5"
                style={{ width: 'calc(10% - 4px)' }}
              >
                <div className="h-full flex flex-col justify-end items-center">
                  <div
                    className={`w-full rounded-t transition-all ${
                      isCurrentAccount
                        ? 'bg-purple-600'
                        : 'bg-gray-400 hover:bg-gray-500'
                    }`}
                    style={{ height: `${heightPercent}%` }}
                    title={`${peer.name}: ${peer.caseVolume} cases`}
                  />
                  {isCurrentAccount && (
                    <span className="text-xs font-bold text-purple-600 mt-1">You</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Highest</span>
          <span>Top 10 Accounts</span>
          <span>10th</span>
        </div>
      </div>

      {/* Similar Accounts */}
      {similarAccounts.length > 0 && (
        <div className="pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-600 font-medium mb-2">
            SIMILAR ACCOUNTS (within 20% of your volume)
          </p>
          <div className="flex flex-wrap gap-2">
            {similarAccounts.slice(0, 5).map(account => (
              <div
                key={account.name}
                className="px-3 py-1 bg-purple-50 border border-purple-200 rounded-full text-sm"
              >
                <span className="font-medium text-purple-900">{account.name}</span>
                <span className="text-purple-600 ml-1">({account.caseVolume})</span>
              </div>
            ))}
            {similarAccounts.length > 5 && (
              <span className="text-sm text-gray-500">+{similarAccounts.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
