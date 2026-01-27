'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle } from 'lucide-react';
import { FrictionCard, Theme } from '@/types';

interface Cluster {
  pattern: string;
  cards: FrictionCard[];
  avgSeverity: number;
  severityDistribution: {
    critical: number; // 5
    high: number;     // 4
    medium: number;   // 3
    low: number;      // 2
    minor: number;    // 1
  };
}

interface FrictionClustersProps {
  frictionCards: FrictionCard[];
  themes: Theme[];
}

export default function FrictionClusters({ frictionCards, themes }: FrictionClustersProps) {
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  console.log('FrictionClusters component rendering:', {
    frictionCardsCount: frictionCards.length,
    themesCount: themes.length,
    frictionCards: frictionCards.slice(0, 2) // Log first 2 cards
  });

  // Group by theme first
  const cardsByTheme = frictionCards.reduce((acc, card) => {
    if (!acc[card.theme_key]) acc[card.theme_key] = [];
    acc[card.theme_key].push(card);
    return acc;
  }, {} as Record<string, FrictionCard[]>);

  // Smart clustering within each theme
  const clusterCards = (cards: FrictionCard[]): Cluster[] => {
    // Extract key terms from summaries
    const clusters: Record<string, FrictionCard[]> = {};

    cards.forEach(card => {
      const summary = card.summary.toLowerCase();

      // Define pattern keywords for grouping
      const patterns = [
        { key: 'phone_calls', terms: ['call', 'phone', 'dialer', 'calling'], label: 'Phone/Call Issues' },
        { key: 'login_auth', terms: ['login', 'authentication', 'password', 'access denied'], label: 'Login & Authentication' },
        { key: 'system_stuck', terms: ['stuck', 'frozen', 'freeze', 'not responding'], label: 'System Freezing/Stuck' },
        { key: 'connectivity', terms: ['connection', 'connectivity', 'network', 'disconnect'], label: 'Connectivity Issues' },
        { key: 'microphone', terms: ['microphone', 'mic', 'audio', 'headset'], label: 'Audio/Microphone Problems' },
        { key: 'location_access', terms: ['location', 'locations', 'district', 'site access'], label: 'Location Access Issues' },
        { key: 'integration', terms: ['integration', 'api', 'sync', 'observe.ai'], label: 'Integration Problems' },
        { key: 'billing', terms: ['billing', 'invoice', 'charge', 'payment'], label: 'Billing Issues' },
        { key: 'email_delivery', terms: ['email', 'notification', 'alert'], label: 'Email/Notification Issues' },
        { key: 'data_issues', terms: ['data', 'report', 'duplicate', 'missing'], label: 'Data Quality Issues' },
        { key: 'system_errors', terms: ['error', 'failed', 'failure', 'crash'], label: 'System Errors' },
        { key: 'ui_problems', terms: ['button', 'screen', 'interface', 'display'], label: 'UI/Interface Problems' },
      ];

      // Find best matching pattern
      let matchedPattern = 'other_issues';
      let matchedLabel = 'Other Issues';
      let maxMatches = 0;

      patterns.forEach(pattern => {
        const matches = pattern.terms.filter(term => summary.includes(term)).length;
        if (matches > maxMatches) {
          maxMatches = matches;
          matchedPattern = pattern.key;
          matchedLabel = pattern.label;
        }
      });

      const clusterKey = `${matchedPattern}|||${matchedLabel}`;
      if (!clusters[clusterKey]) clusters[clusterKey] = [];
      clusters[clusterKey].push(card);
    });

    // Convert to Cluster objects and calculate stats
    return Object.entries(clusters)
      .map(([key, clusterCards]) => {
        const [pattern, label] = key.split('|||');
        const avgSeverity = clusterCards.reduce((sum, c) => sum + c.severity, 0) / clusterCards.length;

        const severityDistribution = {
          critical: clusterCards.filter(c => c.severity === 5).length,
          high: clusterCards.filter(c => c.severity === 4).length,
          medium: clusterCards.filter(c => c.severity === 3).length,
          low: clusterCards.filter(c => c.severity === 2).length,
          minor: clusterCards.filter(c => c.severity === 1).length,
        };

        return {
          pattern: label,
          cards: clusterCards.sort((a, b) => b.severity - a.severity),
          avgSeverity,
          severityDistribution,
        };
      })
      .sort((a, b) => {
        // Sort by impact (count * avg severity)
        const impactA = a.cards.length * a.avgSeverity;
        const impactB = b.cards.length * b.avgSeverity;
        return impactB - impactA;
      });
  };

  const getThemeLabel = (themeKey: string) => {
    const theme = themes.find(t => t.theme_key === themeKey);
    return theme?.label || themeKey.replace(/_/g, ' ');
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 5) return 'text-red-700 bg-red-100';
    if (severity >= 4) return 'text-red-600 bg-red-50';
    if (severity >= 3) return 'text-yellow-600 bg-yellow-50';
    if (severity >= 2) return 'text-blue-600 bg-blue-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getSeverityBadgeColor = (severity: number) => {
    if (severity >= 5) return 'bg-red-600 text-white';
    if (severity >= 4) return 'bg-red-500 text-white';
    if (severity >= 3) return 'bg-yellow-500 text-white';
    if (severity >= 2) return 'bg-blue-500 text-white';
    return 'bg-gray-400 text-white';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High confidence';
    if (confidence >= 0.6) return 'Medium confidence';
    return 'Low confidence';
  };

  // Sort themes by total impact
  const sortedThemes = Object.entries(cardsByTheme)
    .map(([themeKey, cards]) => {
      const avgSeverity = cards.reduce((sum, c) => sum + c.severity, 0) / cards.length;
      const impact = cards.length * avgSeverity;
      return { themeKey, cards, avgSeverity, impact };
    })
    .sort((a, b) => b.impact - a.impact);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Friction Signals ({frictionCards.length} in last 30 days)
        </h2>
        <div className="text-xs text-gray-500">
          Grouped by patterns for easier analysis
        </div>
      </div>

      {sortedThemes.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No friction signals detected in the last 30 days
        </div>
      ) : (
        <div className="space-y-4">
          {sortedThemes.map(({ themeKey, cards, avgSeverity, impact }) => {
            const clusters = clusterCards(cards);
            const isThemeExpanded = expandedTheme === themeKey;

            return (
              <div key={themeKey} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Theme Header */}
                <button
                  onClick={() => setExpandedTheme(isThemeExpanded ? null : themeKey)}
                  className="w-full bg-gray-50 px-4 py-3 flex justify-between items-center hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {isThemeExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      )}
                      <h3 className="font-semibold text-gray-900">{getThemeLabel(themeKey)}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="font-medium">{cards.length} issues</span>
                      <span>•</span>
                      <span>Avg severity: {avgSeverity.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {cards.some(c => c.severity >= 4) && (
                      <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
                        {cards.filter(c => c.severity >= 4).length} high severity
                      </span>
                    )}
                  </div>
                </button>

                {/* Clusters within theme */}
                {isThemeExpanded && (
                  <div className="divide-y divide-gray-200">
                    {clusters.map((cluster, clusterIdx) => {
                      const clusterKey = `${themeKey}-${clusterIdx}`;
                      const isClusterExpanded = expandedCluster === clusterKey;

                      return (
                        <div key={clusterKey} className="bg-white">
                          {/* Cluster Header */}
                          <button
                            onClick={() => setExpandedCluster(isClusterExpanded ? null : clusterKey)}
                            className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                {isClusterExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-gray-500" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-gray-500" />
                                )}
                                <AlertTriangle className="w-4 h-4 text-orange-500" />
                              </div>
                              <div className="text-left">
                                <p className="font-medium text-gray-900">{cluster.pattern}</p>
                                <p className="text-xs text-gray-600">
                                  {cluster.cards.length} cases • Avg severity: {cluster.avgSeverity.toFixed(1)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Severity badges */}
                              {cluster.severityDistribution.critical > 0 && (
                                <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">
                                  {cluster.severityDistribution.critical} Critical
                                </span>
                              )}
                              {cluster.severityDistribution.high > 0 && (
                                <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">
                                  {cluster.severityDistribution.high} High
                                </span>
                              )}
                              {cluster.severityDistribution.medium > 0 && (
                                <span className="px-2 py-1 bg-yellow-500 text-white text-xs font-bold rounded">
                                  {cluster.severityDistribution.medium} Med
                                </span>
                              )}
                            </div>
                          </button>

                          {/* Individual cards in cluster */}
                          {isClusterExpanded && (
                            <div className="px-4 pb-3 space-y-2">
                              {cluster.cards.map((card, cardIdx) => (
                                <div
                                  key={card.id}
                                  className={`p-3 rounded-lg border ${getSeverityColor(card.severity)}`}
                                >
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${getSeverityBadgeColor(card.severity)}`}>
                                          Severity {card.severity}
                                        </span>
                                        {card.sentiment && (
                                          <span className="text-xs text-gray-600 capitalize">
                                            {card.sentiment}
                                          </span>
                                        )}
                                        {card.raw_input?.metadata?.created_date && (
                                          <span className="text-xs text-gray-500">
                                            {new Date(card.raw_input.metadata.created_date).toLocaleDateString('en-US', {
                                              month: 'short',
                                              day: 'numeric'
                                            })}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm text-gray-900">{card.summary}</p>

                                      {/* Root cause if available */}
                                      {card.root_cause_hypothesis && (
                                        <p className="text-xs text-gray-600 mt-2 italic">
                                          → {card.root_cause_hypothesis}
                                        </p>
                                      )}
                                    </div>

                                    {/* Salesforce link */}
                                    {card.raw_input?.source_url && (
                                      <a
                                        href={card.raw_input.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>

                                  {/* Confidence indicator */}
                                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-current border-opacity-20">
                                    <span className="text-xs text-gray-600">
                                      {getConfidenceLabel(card.confidence_score)}
                                    </span>
                                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-current rounded-full"
                                        style={{ width: `${card.confidence_score * 100}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-medium text-gray-700">
                                      {(card.confidence_score * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
