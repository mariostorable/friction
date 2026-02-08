'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { BarChart3, ExternalLink, TrendingUp, Loader2 } from 'lucide-react';

interface AccountTicketData {
  accountId: string;
  accountName: string;
  arr: number;
  resolved_30d: number;
  in_progress: number;
  open: number;
  total: number;
  tickets: Array<{
    jira_key: string;
    summary: string;
    status: string;
    issue_url: string;
    theme_keys: string[];
    case_count: number;
  }>;
}

export default function JiraAccountBreakdown() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountTicketData[]>([]);
  const [sortBy, setSortBy] = useState<'total' | 'arr' | 'name'>('total');
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchAccountBreakdown();
  }, []);

  async function fetchAccountBreakdown() {
    try {
      const response = await fetch('/api/jira/account-breakdown');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Failed to fetch account breakdown:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No Jira tickets found for your accounts</p>
          <p className="text-sm text-gray-500 mt-1">Sync Jira to see ticket breakdown by account</p>
        </div>
      </div>
    );
  }

  const sortedAccounts = [...accounts].sort((a, b) => {
    if (sortBy === 'total') return b.total - a.total;
    if (sortBy === 'arr') return (b.arr || 0) - (a.arr || 0);
    return a.accountName.localeCompare(b.accountName);
  });

  const maxTotal = Math.max(...accounts.map(a => a.total));

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Jira Tickets by Account</h3>
            <p className="text-sm text-gray-600 mt-1">
              Active roadmap items addressing customer friction
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="total">Total Tickets</option>
              <option value="arr">ARR</option>
              <option value="name">Account Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="p-6">
        <div className="space-y-3">
          {sortedAccounts.slice(0, 15).map((account) => (
            <div key={account.accountId} className="space-y-2">
              {/* Account Row with Bar */}
              <div className="flex items-center gap-3">
                <div className="w-48 flex-shrink-0">
                  <button
                    onClick={() => setExpandedAccount(expandedAccount === account.accountId ? null : account.accountId)}
                    className="text-sm font-medium text-gray-900 hover:text-purple-700 text-left truncate block w-full"
                  >
                    {account.accountName}
                  </button>
                  <div className="text-xs text-gray-500">
                    {account.arr ? `$${(account.arr / 1000).toFixed(0)}K ARR` : ''}
                  </div>
                </div>

                <div className="flex-1 flex items-center gap-2">
                  {/* Bar segments */}
                  <div className="flex-1 flex items-center h-8 bg-gray-100 rounded-lg overflow-hidden">
                    {account.resolved_30d > 0 && (
                      <div
                        className="h-full bg-green-500 flex items-center justify-center text-xs font-medium text-white"
                        style={{ width: `${(account.resolved_30d / maxTotal) * 100}%` }}
                        title={`${account.resolved_30d} resolved (30d)`}
                      >
                        {account.resolved_30d}
                      </div>
                    )}
                    {account.in_progress > 0 && (
                      <div
                        className="h-full bg-blue-500 flex items-center justify-center text-xs font-medium text-white"
                        style={{ width: `${(account.in_progress / maxTotal) * 100}%` }}
                        title={`${account.in_progress} in progress`}
                      >
                        {account.in_progress}
                      </div>
                    )}
                    {account.open > 0 && (
                      <div
                        className="h-full bg-gray-500 flex items-center justify-center text-xs font-medium text-white"
                        style={{ width: `${(account.open / maxTotal) * 100}%` }}
                        title={`${account.open} open`}
                      >
                        {account.open}
                      </div>
                    )}
                  </div>

                  <div className="text-sm font-semibold text-gray-900 w-12 text-right">
                    {account.total}
                  </div>
                </div>
              </div>

              {/* Expanded Ticket Details */}
              {expandedAccount === account.accountId && account.tickets.length > 0 && (
                <div className="ml-48 bg-gray-50 rounded-lg p-4 space-y-2">
                  {account.tickets.map((ticket) => (
                    <div key={ticket.jira_key} className="flex items-start gap-3 text-sm border-b border-gray-200 pb-2 last:border-0">
                      <a
                        href={ticket.issue_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-purple-700 hover:text-purple-900 flex items-center gap-1"
                      >
                        {ticket.jira_key}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <div className="flex-1">
                        <div className="text-gray-900">{ticket.summary}</div>
                        {ticket.theme_keys.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {ticket.theme_keys.slice(0, 3).map((theme) => (
                              <span key={theme} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                {theme.replace(/_/g, ' ')}
                              </span>
                            ))}
                            {ticket.theme_keys.length > 3 && (
                              <span className="text-xs text-gray-500">
                                +{ticket.theme_keys.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                        {ticket.case_count > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            {ticket.case_count} support case{ticket.case_count !== 1 ? 's' : ''} linked
                          </div>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.status.toLowerCase().includes('done') || ticket.status.toLowerCase().includes('closed')
                          ? 'bg-green-100 text-green-800'
                          : ticket.status.toLowerCase().includes('progress')
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {ticket.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {accounts.length > 15 && (
          <div className="mt-6 text-center text-sm text-gray-500">
            Showing top 15 accounts. {accounts.length - 15} more accounts have Jira tickets.
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-6 pb-6 flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-gray-600">Resolved (30d)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span className="text-gray-600">In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-500 rounded"></div>
          <span className="text-gray-600">Open</span>
        </div>
      </div>
    </div>
  );
}
