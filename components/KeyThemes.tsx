'use client';

interface KeyThemesProps {
  accounts: any[];
}

export default function KeyThemes({ accounts }: KeyThemesProps) {
  // Aggregate themes across all accounts
  const themeCounts: Record<string, { count: number; totalSeverity: number; accounts: Set<string> }> = {};
  
  accounts.forEach(account => {
    if (account.current_snapshot?.top_themes) {
      account.current_snapshot.top_themes.forEach((theme: any) => {
        if (!themeCounts[theme.theme_key]) {
          themeCounts[theme.theme_key] = { count: 0, totalSeverity: 0, accounts: new Set() };
        }
        themeCounts[theme.theme_key].count += theme.count;
        themeCounts[theme.theme_key].totalSeverity += theme.avg_severity * theme.count;
        themeCounts[theme.theme_key].accounts.add(account.name);
      });
    }
  });

  const topThemes = Object.entries(themeCounts)
    .map(([theme, data]) => ({
      theme,
      count: data.count,
      avgSeverity: data.totalSeverity / data.count,
      accountCount: data.accounts.size,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (topThemes.length === 0) {
    return null;
  }

  const getThemeLabel = (key: string) => {
    return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 4) return 'bg-red-100 text-red-800 border-red-300';
    if (severity >= 3) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-green-100 text-green-800 border-green-300';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Top Friction Themes Across Portfolio</h2>
      <p className="text-sm text-gray-600 mb-6">Most common issues affecting your accounts</p>
      
      <div className="space-y-3">
        {topThemes.map((theme, idx) => (
          <div key={theme.theme} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-4 flex-1">
              <div className="text-2xl font-bold text-gray-400">#{idx + 1}</div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{getThemeLabel(theme.theme)}</p>
                <p className="text-sm text-gray-600">
                  Affecting {theme.accountCount} account{theme.accountCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-gray-600">Total Issues</p>
                <p className="text-2xl font-bold text-gray-900">{theme.count}</p>
              </div>
              <div className={`px-3 py-2 rounded-lg border ${getSeverityColor(theme.avgSeverity)}`}>
                <p className="text-xs font-medium">Avg Severity</p>
                <p className="text-lg font-bold">{theme.avgSeverity.toFixed(1)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
