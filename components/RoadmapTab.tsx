'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CheckCircle2, Loader2, ExternalLink, AlertCircle, Clock, Zap, ArrowRight } from 'lucide-react';

interface JiraTicket {
  jira_key: string;
  summary: string;
  ai_summary: string | null;
  status: string;
  priority: string;
  resolution_date: string | null;
  updated_date: string;
  issue_url: string;
  theme_keys: string[];
  account_names: string[];
  affected_account_count: number;
}

interface RoadmapData {
  resolved: Record<string, JiraTicket[]>;
  in_progress: Record<string, JiraTicket[]>;
  open: Record<string, JiraTicket[]>;
}

export default function RoadmapTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RoadmapData>({ resolved: {}, in_progress: {}, open: {} });
  const [activeStatus, setActiveStatus] = useState<'resolved' | 'in_progress' | 'open'>('in_progress');
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchRoadmap();
  }, []);

  async function fetchRoadmap() {
    try {
      const response = await fetch('/api/jira/roadmap');
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch roadmap:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
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

  const renderGroupedTickets = (ticketsByTheme: Record<string, JiraTicket[]>) => {
    const themes = Object.keys(ticketsByTheme).sort();

    if (themes.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          No tickets in this category
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {themes.map(theme => {
          const tickets = ticketsByTheme[theme];
          const totalAccounts = new Set(tickets.flatMap(t => t.account_names)).size;

          return (
            <div key={theme} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Theme Header */}
              <div className="bg-purple-50 border-b border-purple-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-purple-900">
                    {theme.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-purple-700">
                    <span>{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>{totalAccounts} account{totalAccounts !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

              {/* Tickets in this theme */}
              <div className="p-4 space-y-3 bg-white">
                {tickets.map((ticket) => (
                  <div key={ticket.jira_key} className="border border-gray-200 rounded-lg p-3 hover:border-purple-300 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-2">
                          <a
                            href={ticket.issue_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-700 font-semibold hover:text-purple-900 flex items-center gap-1"
                          >
                            {ticket.jira_key}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                            {ticket.priority}
                          </span>
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {ticket.status}
                          </span>
                        </div>

                        {/* Summary */}
                        <h4 className="text-sm font-medium text-gray-900 mb-2">
                          {ticket.summary}
                        </h4>

                        {/* AI Summary */}
                        {ticket.ai_summary && (
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                            {ticket.ai_summary}
                          </p>
                        )}

                        {/* Accounts */}
                        {ticket.account_names.length > 0 && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Affects:
                            </span>
                            <span className="font-medium">
                              {ticket.account_names.slice(0, 2).join(', ')}
                              {ticket.account_names.length > 2 && ` +${ticket.account_names.length - 2} more`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Date info */}
                      <div className="text-right text-sm text-gray-500 flex-shrink-0">
                        {ticket.resolution_date && (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {new Date(ticket.resolution_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        )}
                        {!ticket.resolution_date && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>
                              Updated {new Date(ticket.updated_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Product Roadmap</h2>
        <p className="text-sm text-gray-600 mt-1">
          Jira tickets addressing customer friction across your portfolio
        </p>
      </div>

      {/* Status Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveStatus('resolved')}
            className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${
              activeStatus === 'resolved'
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Resolved ({Object.values(data.resolved).flat().length})
            </span>
          </button>
          <button
            onClick={() => setActiveStatus('in_progress')}
            className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${
              activeStatus === 'in_progress'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              In Progress ({Object.values(data.in_progress).flat().length})
            </span>
          </button>
          <button
            onClick={() => setActiveStatus('open')}
            className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${
              activeStatus === 'open'
                ? 'border-gray-600 text-gray-700'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              On Radar ({Object.values(data.open).flat().length})
            </span>
          </button>
        </div>
      </div>

      {/* Ticket List grouped by Theme */}
      <div>
        {activeStatus === 'resolved' && renderGroupedTickets(data.resolved)}
        {activeStatus === 'in_progress' && renderGroupedTickets(data.in_progress)}
        {activeStatus === 'open' && renderGroupedTickets(data.open)}
      </div>
    </div>
  );
}
