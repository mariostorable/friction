'use client';

import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface AccountCardProps {
  account: any;
}

export default function AccountCard({ account }: AccountCardProps) {
  const router = useRouter();

  const getTrendColor = (direction?: string) => {
    if (direction === 'worsening') return 'text-red-600';
    if (direction === 'improving') return 'text-green-600';
    return 'text-gray-400';
  };

  const getTrendIcon = (direction?: string) => {
    if (direction === 'worsening') return <TrendingUp className="w-4 h-4" />;
    if (direction === 'improving') return <TrendingDown className="w-4 h-4" />;
    return null;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-red-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-green-600';
  };

  const mrr = account.arr ? Math.round(account.arr / 12) : null;
  const ofiScore = account.current_snapshot?.ofi_score || 0;

  return (
    <button
      onClick={() => router.push(`/account/${account.id}`)}
      className="w-full text-left p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">{account.name}</h3>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>{mrr ? `$${mrr.toLocaleString()}/mo` : 'No MRR'}</span>
            {account.products && (
              <>
                <span>•</span>
                <span>{account.products}</span>
              </>
            )}
          </div>
        </div>
        
        {account.current_snapshot && (
          <div className="flex items-center gap-2">
            <div className={`text-lg font-bold ${getScoreColor(ofiScore)}`}>
              {Math.round(ofiScore)}
            </div>
            {account.current_snapshot.trend_direction && (
              <div className={getTrendColor(account.current_snapshot.trend_direction)}>
                {getTrendIcon(account.current_snapshot.trend_direction)}
              </div>
            )}
          </div>
        )}
      </div>

      {account.alert_count > 0 && (
        <div className="flex items-center gap-1 text-sm text-red-600 mt-2">
          <AlertCircle className="w-4 h-4" />
          <span>{account.alert_count} active alert{account.alert_count !== 1 ? 's' : ''}</span>
        </div>
      )}

      {account.recent_friction_cards && account.recent_friction_cards.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-600 line-clamp-2">
            Latest: {account.recent_friction_cards[0].summary}
          </p>
        </div>
      )}
    </button>
  );
}
