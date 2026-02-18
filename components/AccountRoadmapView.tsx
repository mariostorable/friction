'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CheckCircle2, Loader2, ExternalLink, Clock, Zap, ChevronDown, ChevronRight } from 'lucide-react';
import RoadmapFilters from './RoadmapFilters';

interface JiraIssue {
  id: string;
  jira_key: string;
  summary: string;
  status: string;
  priority: string;
  resolution_date: string | null;
  updated_date: string;
  issue_url: string;
  theme_key: string;
}

interface AccountSummary {
  account_id: string;
  account_name: string;
  total_issues: number;
  resolved_count: number;
  in_progress_count: number;
  open_count: number;
  resolved: JiraIssue[];
  in_progress: JiraIssue[];
  open: JiraIssue[];
}

export default function AccountRoadmapView() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [allAccounts, setAllAccounts] = useState<Array<{ id: string; name: string; products: string }>>([]);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<'resolved' | 'in_progress' | 'open'>('resolved');
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  // Filter state
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [portfolioFilter, setPortfolioFilter] = useState<'all' | 'top_25_edge' | 'top_25_sitelink' | 'top_25_marine'>('all');
  const [productFilter, setProductFilter] = useState<'all' | 'edge' | 'sitelink' | 'other'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'resolved' | 'closed'>('all');
  const [dateRangeDays, setDateRangeDays] = useState(30);

  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchAllAccountsForFilter();
    fetchAccountRoadmap();
  }, []);

  // Refetch when filters change
  useEffect(() => {
    fetchAccountRoadmap();
  }, [selectedAccountIds, portfolioFilter, productFilter, statusFilter, dateRangeDays]);

  async function fetchAllAccountsForFilter() {
    try {
      const { data } = await supabase
        .from('accounts')
        .select('id, name, products')
        .eq('status', 'active')
        .order('name');

      if (data) {
        setAllAccounts(data);
      }
    } catch (error) {
      console.error('Failed to fetch accounts for filter:', error);
    }
  }

  async function fetchAccountRoadmap() {
    try {
      setLoading(true);

      // Build query parameters
      const params = new URLSearchParams();
      if (selectedAccountIds.length > 0) {
        params.set('accountIds', selectedAccountIds.join(','));
      }
      if (portfolioFilter !== 'all') {
        params.set('portfolio', portfolioFilter);
      }
      if (productFilter !== 'all') {
        params.set('product', productFilter);
      }
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      params.set('dateRangeDays', dateRangeDays.toString());

      const response = await fetch(`/api/jira/roadmap-by-account?${params.toString()}`);
      if (response.ok) {
        const result = await response.json();
        setAccounts(result.accounts || []);
      }
    } catch (error) {
      console.error('Failed to fetch account roadmap:', error);
    } finally {
      setLoading(false);
    }
  }

  const clearFilters = () => {
    setSelectedAccountIds([]);
    setPortfolioFilter('all');
    setProductFilter('all');
    setStatusFilter('all');
    setDateRangeDays(30);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (accounts.length === 0) {
    const hasFiltersApplied = selectedAccountIds.length > 0 || portfolioFilter !== 'all' || productFilter !== 'all';

    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-2">
          {hasFiltersApplied ? 'No accounts match your filters' : 'No Jira tickets linked to accounts yet'}
        </p>
        <p className="text-sm text-gray-500">
          {hasFiltersApplied ? 'Try adjusting your filters to see more results' : 'Sync Jira to see tickets organized by account'}
        </p>
        {hasFiltersApplied && (
          <button
            onClick={clearFilters}
            className="mt-4 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100"
          >
            Clear Filters
          </button>
        )}
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    const p = priority?.toLowerCase() || '';
    if (p.includes('highest') || p.includes('critical')) return 'text-red-600 bg-red-50';
    if (p.includes('high')) return 'text-orange-600 bg-orange-50';
    if (p.includes('medium')) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const renderIssue = (issue: JiraIssue) => {
    const isExpanded = expandedTicket === issue.jira_key;

    return (
      <div key={issue.jira_key} className="border-b border-gray-200 last:border-b-0">
        <button
          onClick={() => setExpandedTicket(isExpanded ? null : issue.jira_key)}
          className="w-full px-3 py-2 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="grid grid-cols-12 gap-3 items-center">
            {/* Jira Key */}
            <div className="col-span-2">
              <span className="text-sm font-medium text-purple-700">{issue.jira_key}</span>
            </div>

            {/* Priority */}
            <div className="col-span-1">
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor(issue.priority)}`}>
                {issue.priority?.substring(0, 3) || 'N/A'}
              </span>
            </div>

            {/* Summary */}
            <div className="col-span-6">
              <p className="text-sm text-gray-900 truncate">{issue.summary}</p>
            </div>

            {/* Status */}
            <div className="col-span-2">
              <span className="text-xs text-gray-600">{issue.status}</span>
            </div>

            {/* Date */}
            <div className="col-span-1 text-right">
              {issue.resolution_date && (
                <span className="text-xs text-green-600">
                  {new Date(issue.resolution_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="px-3 py-3 bg-gray-50 border-t border-gray-200">
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">Full Description:</span>
                <p className="text-gray-900 mt-1">{issue.summary}</p>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <span className="font-medium text-gray-700">Priority:</span>{' '}
                  <span className="text-gray-900">{issue.priority || 'N/A'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Status:</span>{' '}
                  <span className="text-gray-900">{issue.status}</span>
                </div>
                {issue.resolution_date && (
                  <div>
                    <span className="font-medium text-gray-700">Resolved:</span>{' '}
                    <span className="text-green-600">
                      {new Date(issue.resolution_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <a
                  href={issue.issue_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-purple-700 hover:text-purple-900 font-medium"
                >
                  View in Jira <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Product Roadmap by Account</h2>
        <p className="text-sm text-gray-600 mt-1">
          Jira tickets addressing friction for your top accounts
        </p>
      </div>

      {/* Filters */}
      <RoadmapFilters
        accounts={allAccounts}
        selectedAccountIds={selectedAccountIds}
        portfolioFilter={portfolioFilter}
        productFilter={productFilter}
        statusFilter={statusFilter}
        dateRangeDays={dateRangeDays}
        onAccountsChange={setSelectedAccountIds}
        onPortfolioChange={setPortfolioFilter}
        onProductChange={setProductFilter}
        onStatusChange={setStatusFilter}
        onDateRangeChange={setDateRangeDays}
      />

      {/* Filter Summary */}
      {!loading && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {accounts.length} account{accounts.length !== 1 ? 's' : ''}
            {portfolioFilter !== 'all' && ` from ${portfolioFilter.replace(/_/g, ' ')}`}
            {productFilter !== 'all' && ` with ${productFilter.toUpperCase()} products`}
            {selectedAccountIds.length > 0 && ` (${selectedAccountIds.length} selected)`}
          </div>
          {(selectedAccountIds.length > 0 || portfolioFilter !== 'all' || productFilter !== 'all' || statusFilter !== 'all' || dateRangeDays !== 30) && (
            <button
              onClick={clearFilters}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Account List */}
      <div className="space-y-3">
        {accounts.map((account) => {
          const isExpanded = expandedAccount === account.account_id;

          return (
            <div key={account.account_id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Account Header */}
              <button
                onClick={() => setExpandedAccount(isExpanded ? null : account.account_id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">{account.account_name}</h3>
                    <p className="text-sm text-gray-600">{account.total_issues} tickets</p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-3">
                  {account.resolved_count > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">{account.resolved_count}</span>
                    </div>
                  )}
                  {account.in_progress_count > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded">
                      <Zap className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">{account.in_progress_count}</span>
                    </div>
                  )}
                  {account.open_count > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded">
                      <Clock className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">{account.open_count}</span>
                    </div>
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-gray-200 bg-gray-50">
                  {/* Status Tabs */}
                  <div className="px-4 pt-3 border-b border-gray-200 bg-white">
                    <div className="flex gap-4">
                      <button
                        onClick={() => setExpandedStatus('resolved')}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                          expandedStatus === 'resolved'
                            ? 'border-green-600 text-green-700'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Resolved ({account.resolved_count})
                      </button>
                      <button
                        onClick={() => setExpandedStatus('in_progress')}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                          expandedStatus === 'in_progress'
                            ? 'border-blue-600 text-blue-700'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        In Progress ({account.in_progress_count})
                      </button>
                      <button
                        onClick={() => setExpandedStatus('open')}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                          expandedStatus === 'open'
                            ? 'border-gray-600 text-gray-700'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        On Radar ({account.open_count})
                      </button>
                    </div>
                  </div>

                  {/* Issue List */}
                  <div className="p-4 space-y-2">
                    {expandedStatus === 'resolved' && account.resolved.length > 0 && (
                      <div className="space-y-2">
                        {account.resolved.map(renderIssue)}
                      </div>
                    )}
                    {expandedStatus === 'in_progress' && account.in_progress.length > 0 && (
                      <div className="space-y-2">
                        {account.in_progress.map(renderIssue)}
                      </div>
                    )}
                    {expandedStatus === 'open' && account.open.length > 0 && (
                      <div className="space-y-2">
                        {account.open.map(renderIssue)}
                      </div>
                    )}

                    {/* Empty state for each tab */}
                    {expandedStatus === 'resolved' && account.resolved.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No resolved tickets in the last {dateRangeDays} {dateRangeDays === 1 ? 'day' : 'days'}
                      </p>
                    )}
                    {expandedStatus === 'in_progress' && account.in_progress.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No tickets in progress</p>
                    )}
                    {expandedStatus === 'open' && account.open.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No open tickets on radar</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
