'use client';

import { useState } from 'react';
import { AlertCircle, Phone, Mail, Globe, MessageSquare, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

interface CaseOriginData {
  origin: string;
  count: number;
  percentage: string;
  cases: Array<{
    id: string;
    metadata: any;
    source_url: string;
    created_at: string;
  }>;
  priority: number;
}

interface CaseOriginsAlertProps {
  origins: CaseOriginData[];
  accountName: string;
  totalCases: number;
}

export default function CaseOriginsAlert({ origins, accountName, totalCases }: CaseOriginsAlertProps) {
  const [expandedOrigins, setExpandedOrigins] = useState<Set<string>>(new Set());

  if (origins.length === 0) return null;

  const toggleOrigin = (origin: string) => {
    const newExpanded = new Set(expandedOrigins);
    if (newExpanded.has(origin)) {
      newExpanded.delete(origin);
    } else {
      newExpanded.add(origin);
    }
    setExpandedOrigins(newExpanded);
  };

  const getOriginIcon = (origin: string) => {
    const lowerOrigin = origin.toLowerCase();
    if (lowerOrigin.includes('phone')) return <Phone className="w-4 h-4" />;
    if (lowerOrigin.includes('email') || lowerOrigin.includes('mail')) return <Mail className="w-4 h-4" />;
    if (lowerOrigin.includes('web') || lowerOrigin.includes('portal')) return <Globe className="w-4 h-4" />;
    if (lowerOrigin.includes('chat')) return <MessageSquare className="w-4 h-4" />;
    return <AlertCircle className="w-4 h-4" />;
  };

  const getOriginColor = (percentage: number) => {
    if (percentage > 40) return 'bg-red-50 border-red-200 text-red-900';
    if (percentage > 25) return 'bg-orange-50 border-orange-200 text-orange-900';
    return 'bg-blue-50 border-blue-200 text-blue-900';
  };

  // Find anomalous origins (>40% of cases from one channel)
  const anomalousOrigins = origins.filter(o => parseFloat(o.percentage) > 40);
  const hasAnomalies = anomalousOrigins.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            Case Origins (Last 7 Days)
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {totalCases} total cases from {origins.length} channel{origins.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {hasAnomalies && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Alert: {anomalousOrigins[0].percentage}% of cases coming from {anomalousOrigins[0].origin} channel
          </p>
        </div>
      )}

      <div className="space-y-3">
        {origins.map((originData) => {
          const percentage = parseFloat(originData.percentage);
          const colorClass = getOriginColor(percentage);

          return (
            <div
              key={originData.origin}
              className={`rounded-lg border p-4 ${colorClass}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getOriginIcon(originData.origin)}
                  <div>
                    <h4 className="font-semibold">{originData.origin}</h4>
                    <p className="text-sm opacity-80">
                      {originData.count} cases ({originData.percentage}%)
                      {originData.priority > 0 && (
                        <span className="ml-2 font-medium">• {originData.priority} high priority</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{originData.count}</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/50 rounded-full h-2 mb-3">
                <div
                  className="bg-current rounded-full h-2 transition-all"
                  style={{ width: `${Math.min(100, percentage)}%` }}
                />
              </div>

              {/* Recent cases from this origin */}
              {originData.cases.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium opacity-70 uppercase tracking-wide">
                    Recent Cases:
                  </p>
                  {(expandedOrigins.has(originData.origin) ? originData.cases : originData.cases.slice(0, 3)).map((caseItem) => {
                    // Format date as "MMM DD"
                    const formatDate = (dateString: string) => {
                      const date = new Date(dateString);
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    };

                    return (
                      <div
                        key={caseItem.id}
                        className="flex items-center justify-between text-xs bg-white/50 rounded px-2 py-1"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-mono whitespace-nowrap">
                            Case #{caseItem.metadata?.case_number || 'Unknown'}
                            {caseItem.metadata?.priority && (
                              <span className="ml-2 font-medium">
                                {caseItem.metadata.priority}
                              </span>
                            )}
                          </span>
                          {caseItem.metadata?.subject && (
                            <span className="text-gray-600 truncate">
                              • {caseItem.metadata.subject}
                            </span>
                          )}
                          {caseItem.metadata?.created_date && (
                            <span className="text-gray-500 whitespace-nowrap">
                              • {formatDate(caseItem.metadata.created_date)}
                            </span>
                          )}
                        </div>
                        {caseItem.source_url && (
                          <a
                            href={caseItem.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:underline ml-2 whitespace-nowrap"
                          >
                            View
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                  {originData.count > 3 && (
                    <button
                      onClick={() => toggleOrigin(originData.origin)}
                      className="text-xs opacity-70 hover:opacity-100 italic flex items-center gap-1 hover:underline"
                    >
                      {expandedOrigins.has(originData.origin) ? (
                        <>
                          <ChevronUp className="w-3 h-3" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3" />
                          + {originData.count - 3} more cases
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Data shows case distribution by origin channel. High concentration in one channel may indicate specific issues.
      </div>
    </div>
  );
}
