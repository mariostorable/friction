'use client';

import { useState, useEffect } from 'react';
import { AccountWithMetrics } from '@/types';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  aggregateThemesByProduct,
  getTotalIssueCount,
  getAffectedAccountCount,
  ProductFilter,
  ThemeWithAccounts
} from '@/lib/themeAggregation';

interface JiraTicket {
  jira_key: string;
  summary: string;
  status: string;
  issue_url: string;
  priority: string | null;
  resolution_date: string | null;
  release_date: string | null;
  updated_date: string;
}

interface TicketCounts {
  resolved: number;
  in_progress: number;
  open: number;
  total: number;
}

interface ThemesTabProps {
  accounts: AccountWithMetrics[];
  initialExpandedTheme?: string | null;
}

export default function ThemesTab({ accounts, initialExpandedTheme }: ThemesTabProps) {
  const [productFilter, setProductFilter] = useState<ProductFilter>('All');
  const [expandedTheme, setExpandedTheme] = useState<string | null>(initialExpandedTheme || null);
  const [jiraTickets, setJiraTickets] = useState<Record<string, JiraTicket[]>>({});
  const [loadingTickets, setLoadingTickets] = useState<Record<string, boolean>>({});
  const [ticketCounts, setTicketCounts] = useState<Record<string, TicketCounts>>({});
  const [showTicketModal, setShowTicketModal] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'resolved' | 'in_progress' | 'open'>('all');
  const router = useRouter();

  const themes = aggregateThemesByProduct(accounts, productFilter);
  const totalIssues = getTotalIssueCount(themes);
  const affectedAccounts = getAffectedAccountCount(accounts, productFilter);

  // Fetch ticket counts on mount
  useEffect(() => {
    fetchTicketCounts();
  }, []);

  // Fetch Jira tickets when a theme is expanded
  useEffect(() => {
    if (expandedTheme && !jiraTickets[expandedTheme] && !loadingTickets[expandedTheme]) {
      fetchJiraTicketsForTheme(expandedTheme);
    }
  }, [expandedTheme]);

  async function fetchTicketCounts() {
    try {
      const response = await fetch('/api/jira/theme-ticket-counts');
      if (response.ok) {
        const data = await response.json();
        setTicketCounts(data.themeCounts || {});
      }
    } catch (error) {
      console.error('Error fetching ticket counts:', error);
    }
  }

  async function fetchJiraTicketsForTheme(themeKey: string) {
    setLoadingTickets(prev => ({ ...prev, [themeKey]: true }));

    try {
      const response = await fetch(`/api/jira/theme-tickets?theme=${themeKey}`);
      if (response.ok) {
        const data = await response.json();
        setJiraTickets(prev => ({ ...prev, [themeKey]: data.tickets || [] }));
      }
    } catch (error) {
      console.error('Error fetching Jira tickets:', error);
      setJiraTickets(prev => ({ ...prev, [themeKey]: [] }));
    } finally {
      setLoadingTickets(prev => ({ ...prev, [themeKey]: false }));
    }
  }

  function getSeverityColor(severity: number): string {
    if (severity >= 4) return 'bg-red-100 text-red-800';
    if (severity >= 3) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  }

  function getTicketStatusCategory(status: string): 'resolved' | 'in_progress' | 'open' {
    const statusLower = status.toLowerCase();

    // Resolved statuses
    if (statusLower.includes('done') ||
        statusLower.includes('closed') ||
        statusLower.includes('resolved') ||
        statusLower.includes('complete')) {
      return 'resolved';
    }

    // In progress statuses
    if (statusLower.includes('progress') ||
        statusLower.includes('development') ||
        statusLower.includes('testing') ||
        statusLower.includes('review') ||
        statusLower.includes('staging')) {
      return 'in_progress';
    }

    // Everything else is open
    return 'open';
  }

  function getFilteredTickets(themeKey: string): JiraTicket[] {
    const tickets = jiraTickets[themeKey] || [];
    if (statusFilter === 'all') return tickets;

    return tickets.filter(ticket => getTicketStatusCategory(ticket.status) === statusFilter);
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function toggleTheme(themeKey: string) {
    setExpandedTheme(expandedTheme === themeKey ? null : themeKey);
  }

  function openTicketModal(themeKey: string) {
    setStatusFilter('all'); // Reset filter when opening modal
    setShowTicketModal(themeKey);
    if (!jiraTickets[themeKey]) {
      fetchJiraTicketsForTheme(themeKey);
    }
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
                    {ticketCounts[theme.theme_key] && ticketCounts[theme.theme_key].total > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openTicketModal(theme.theme_key);
                        }}
                        className="px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-purple-900">
                            {ticketCounts[theme.theme_key].total} Jira {ticketCounts[theme.theme_key].total === 1 ? 'ticket' : 'tickets'}
                          </span>
                          <div className="flex items-center gap-1 text-xs">
                            {ticketCounts[theme.theme_key].resolved > 0 && (
                              <span className="text-green-700">✓{ticketCounts[theme.theme_key].resolved}</span>
                            )}
                            {ticketCounts[theme.theme_key].in_progress > 0 && (
                              <span className="text-blue-700">◐{ticketCounts[theme.theme_key].in_progress}</span>
                            )}
                            {ticketCounts[theme.theme_key].open > 0 && (
                              <span className="text-gray-600">○{ticketCounts[theme.theme_key].open}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    )}
                    <span className="text-sm text-gray-600">
                      {theme.affected_accounts.length} {theme.affected_accounts.length === 1 ? 'account' : 'accounts'}
                    </span>
                  </div>
                </button>

                {/* Expanded Details */}
                {expandedTheme === theme.theme_key && (
                  <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 space-y-4">
                    {/* Jira Tickets */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        Product Roadmap
                        {jiraTickets[theme.theme_key] && jiraTickets[theme.theme_key].length > 0 && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-medium">
                            {jiraTickets[theme.theme_key].length} {jiraTickets[theme.theme_key].length === 1 ? 'ticket' : 'tickets'}
                          </span>
                        )}
                      </h4>
                      {loadingTickets[theme.theme_key] && (
                        <div className="text-sm text-gray-500">Loading roadmap tickets...</div>
                      )}
                      {!loadingTickets[theme.theme_key] && jiraTickets[theme.theme_key] && jiraTickets[theme.theme_key].length > 0 && (
                        <div className="space-y-2">
                          {jiraTickets[theme.theme_key].map(ticket => (
                            <div key={ticket.jira_key} className="bg-white rounded border border-gray-200 p-3">
                              <div className="flex items-start gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <a
                                      href={ticket.issue_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-sm font-mono font-semibold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1"
                                    >
                                      {ticket.jira_key}
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded border border-gray-300 text-gray-700">
                                      {ticket.status}
                                    </span>
                                    {ticket.priority && (
                                      <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-medium">
                                        {ticket.priority}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-700">{ticket.summary}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {!loadingTickets[theme.theme_key] && jiraTickets[theme.theme_key] && jiraTickets[theme.theme_key].length === 0 && (
                        <div className="text-sm text-gray-500 italic">No roadmap tickets linked to this theme yet.</div>
                      )}
                    </div>

                    {/* Severity Distribution */}
                    <div>
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

      {/* Jira Ticket Modal */}
      {showTicketModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowTicketModal(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Jira Roadmap Tickets
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {themes.find(t => t.theme_key === showTicketModal)?.theme_label}
                  </p>
                </div>
                <button
                  onClick={() => setShowTicketModal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Status Summary - Clickable Filters */}
              {ticketCounts[showTicketModal] && (
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                      statusFilter === 'all'
                        ? 'bg-gray-100 border-gray-400 shadow-sm'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs font-medium text-gray-700">Total:</span>
                    <span className="text-sm font-semibold text-gray-900">{ticketCounts[showTicketModal].total}</span>
                  </button>
                  <button
                    onClick={() => setStatusFilter('resolved')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                      statusFilter === 'resolved'
                        ? 'bg-green-50 border-green-300 shadow-sm'
                        : 'border-gray-200 hover:bg-green-50'
                    }`}
                  >
                    <span className="text-xs font-medium text-green-700">Resolved:</span>
                    <span className="text-sm font-semibold text-green-900">{ticketCounts[showTicketModal].resolved}</span>
                  </button>
                  <button
                    onClick={() => setStatusFilter('in_progress')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                      statusFilter === 'in_progress'
                        ? 'bg-blue-50 border-blue-300 shadow-sm'
                        : 'border-gray-200 hover:bg-blue-50'
                    }`}
                  >
                    <span className="text-xs font-medium text-blue-700">In Progress:</span>
                    <span className="text-sm font-semibold text-blue-900">{ticketCounts[showTicketModal].in_progress}</span>
                  </button>
                  <button
                    onClick={() => setStatusFilter('open')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                      statusFilter === 'open'
                        ? 'bg-orange-50 border-orange-300 shadow-sm'
                        : 'border-gray-200 hover:bg-orange-50'
                    }`}
                  >
                    <span className="text-xs font-medium text-gray-700">Open:</span>
                    <span className="text-sm font-semibold text-gray-900">{ticketCounts[showTicketModal].open}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {loadingTickets[showTicketModal] && (
                <div className="text-center py-8 text-gray-500">Loading tickets...</div>
              )}

              {!loadingTickets[showTicketModal] && jiraTickets[showTicketModal] && jiraTickets[showTicketModal].length > 0 && (
                <div className="space-y-3">
                  {getFilteredTickets(showTicketModal).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No {statusFilter === 'all' ? '' : statusFilter.replace('_', ' ')} tickets found.
                    </div>
                  ) : (
                    getFilteredTickets(showTicketModal).map(ticket => {
                      const statusCategory = getTicketStatusCategory(ticket.status);
                      return (
                        <div key={ticket.jira_key} className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <a
                                  href={ticket.issue_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-mono font-semibold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1"
                                >
                                  {ticket.jira_key}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  statusCategory === 'resolved' ? 'bg-green-100 text-green-800 border border-green-300' :
                                  statusCategory === 'in_progress' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                                  'bg-gray-100 text-gray-700 border border-gray-300'
                                }`}>
                                  {ticket.status}
                                </span>
                                {ticket.priority && (
                                  <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-medium">
                                    {ticket.priority}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-700 mb-2">{ticket.summary}</p>

                              {/* Date information */}
                              <div className="flex items-center gap-4 text-xs text-gray-600">
                                {statusCategory === 'resolved' && ticket.resolution_date && (
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">Resolved:</span>
                                    <span>{formatDate(ticket.resolution_date)}</span>
                                  </div>
                                )}
                                {ticket.release_date && (
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">
                                      {statusCategory === 'resolved' ? 'Released:' : 'Planned Release:'}
                                    </span>
                                    <span className="text-purple-700 font-medium">{formatDate(ticket.release_date)}</span>
                                  </div>
                                )}
                                {!ticket.resolution_date && statusCategory === 'in_progress' && (
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">Last Updated:</span>
                                    <span>{formatDate(ticket.updated_date)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {!loadingTickets[showTicketModal] && jiraTickets[showTicketModal] && jiraTickets[showTicketModal].length === 0 && (
                <div className="text-center py-8 text-gray-500">No tickets found for this theme.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
