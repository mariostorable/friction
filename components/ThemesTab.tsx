'use client';

import { useState } from 'react';
import { AccountWithMetrics } from '@/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  aggregateThemesByProduct,
  getTotalIssueCount,
  getAffectedAccountCount,
  ProductFilter,
  ThemeWithAccounts
} from '@/lib/themeAggregation';

interface ThemesTabProps {
  accounts: AccountWithMetrics[];
}

export default function ThemesTab({ accounts }: ThemesTabProps) {
  const [productFilter, setProductFilter] = useState<ProductFilter>('All');
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const router = useRouter();

  const themes = aggregateThemesByProduct(accounts, productFilter);
  const totalIssues = getTotalIssueCount(themes);
  const affectedAccounts = getAffectedAccountCount(accounts, productFilter);

  function getSeverityColor(severity: number): string {
    if (severity >= 4) return 'bg-red-100 text-red-800';
    if (severity >= 3) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  }

  function toggleTheme(themeKey: string) {
    setExpandedTheme(expandedTheme === themeKey ? null : themeKey);
  }

  return (
    <div className="space-y-6">
      {/* Header with Filter */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Key Friction Themes</h3>
            <p className="text-sm text-gray-600 mt-1">
              {totalIssues} total issues across {affectedAccounts} accounts
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="product-filter" className="text-sm font-medium text-gray-700">
              Filter by Product:
            </label>
            <select
              id="product-filter"
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value as ProductFilter)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="All">All Products</option>
              <option value="EDGE">EDGE</option>
              <option value="SiteLink">SiteLink</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {/* Empty State */}
        {themes.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              No friction data found for {productFilter === 'All' ? 'any accounts' : `${productFilter} customers`}.
            </p>
          </div>
        )}

        {/* Themes List */}
        {themes.length > 0 && (
          <div className="space-y-3">
            {themes.map((theme, index) => (
              <div key={theme.theme_key} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Theme Header */}
                <button
                  onClick={() => toggleTheme(theme.theme_key)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedTheme === theme.theme_key ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <span className="text-sm font-medium text-gray-500">
                      {index + 1}.
                    </span>
                    <span className="text-base font-semibold text-gray-900">
                      {theme.theme_label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">
                      {theme.total_count} {theme.total_count === 1 ? 'issue' : 'issues'}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(theme.avg_severity)}`}>
                      Avg Severity: {theme.avg_severity.toFixed(1)}
                    </span>
                    <span className="text-sm text-gray-600">
                      {theme.affected_accounts.length} {theme.affected_accounts.length === 1 ? 'account' : 'accounts'}
                    </span>
                  </div>
                </button>

                {/* Expanded Details */}
                {expandedTheme === theme.theme_key && (
                  <div className="px-4 py-4 bg-gray-50 border-t border-gray-200">
                    {/* Severity Distribution */}
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Severity Distribution</h4>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-red-800">High (4-5):</span>
                          <span className="text-sm text-gray-900">{theme.severity_distribution.high}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-yellow-800">Medium (3):</span>
                          <span className="text-sm text-gray-900">{theme.severity_distribution.medium}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-green-800">Low (1-2):</span>
                          <span className="text-sm text-gray-900">{theme.severity_distribution.low}</span>
                        </div>
                      </div>
                    </div>

                    {/* Affected Accounts */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Affected Accounts</h4>
                      <div className="space-y-2">
                        {theme.affected_accounts.map(account => (
                          <button
                            key={account.id}
                            onClick={() => router.push(`/account/${account.id}?theme=${theme.theme_key}`)}
                            className="w-full text-left px-3 py-2 bg-white rounded border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-900">{account.name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-600">
                                  {account.count} {account.count === 1 ? 'issue' : 'issues'}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(account.avg_severity)}`}>
                                  {account.avg_severity.toFixed(1)}
                                </span>
                                <span className="text-xs text-blue-600 font-medium">View →</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
