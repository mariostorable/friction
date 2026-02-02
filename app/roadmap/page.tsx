'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import JiraSyncButton from '@/components/JiraSyncButton';
import JiraFieldDiscovery from '@/components/JiraFieldDiscovery';
import { ExternalLink } from 'lucide-react';

export default function RoadmapPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);
  const [accountsWithUnlinkedThemes, setAccountsWithUnlinkedThemes] = useState<any[]>([]);
  const [accountsWithTickets, setAccountsWithTickets] = useState<any[]>([]);

  useEffect(() => {
    loadRoadmapData();
  }, []);

  async function loadRoadmapData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/');
        return;
      }

      // Check if Jira is connected
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('integration_type', 'jira')
        .eq('status', 'active')
        .single();

      setJiraIntegration(integration);

      if (integration) {
        // Get accounts with their friction themes that need tickets
        const { data: accounts } = await supabase
          .from('accounts')
          .select(`
            id,
            name,
            arr,
            friction_theme_summaries:friction_theme_summaries!inner(
              theme_key,
              case_count
            )
          `)
          .order('arr', { ascending: false });

        // Get theme-Jira links
        const { data: themeLinks } = await supabase
          .from('theme_jira_links')
          .select('theme_key, jira_key');

        const linkedThemes = new Set(themeLinks?.map(link => link.theme_key) || []);

        // Process accounts to find themes without tickets
        const unlinked = accounts?.map(account => {
          const themeSummaries = account.friction_theme_summaries || [];
          const unlinkedThemes = themeSummaries.filter(
            (ts: any) => !linkedThemes.has(ts.theme_key)
          );
          return {
            ...account,
            unlinkedThemes,
            totalUnlinkedCases: unlinkedThemes.reduce((sum: number, t: any) => sum + t.case_count, 0)
          };
        }).filter(a => a.unlinkedThemes.length > 0) || [];

        setAccountsWithUnlinkedThemes(unlinked);

        // Get accounts with linked tickets
        const { data: withTickets } = await supabase
          .from('accounts')
          .select(`
            id,
            name,
            arr,
            account_jira_links:account_jira_links!inner(
              jira_key,
              jira_issue:jira_issues!inner(
                key,
                summary,
                status,
                issue_type,
                resolution,
                components,
                fix_versions,
                parent_key,
                priority,
                jira_url
              )
            )
          `)
          .order('arr', { ascending: false });

        setAccountsWithTickets(withTickets || []);
      }
    } catch (error) {
      console.error('Error loading roadmap data:', error);
    } finally {
      setLoading(false);
    }
  }

  const THEME_LABELS: Record<string, string> = {
    'authentication': 'Authentication & Login',
    'performance': 'Performance & Speed',
    'ui_ux': 'UI/UX Issues',
    'integration': 'Integration Issues',
    'data_accuracy': 'Data Accuracy',
    'mobile': 'Mobile Experience',
    'reporting': 'Reporting & Analytics',
    'onboarding': 'Onboarding',
    'other': 'Other Friction Points'
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading roadmap...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Jira Roadmap</h1>
          <p className="text-gray-600">
            Track friction themes, manage Jira tickets, and prioritize improvements across your portfolio
          </p>
        </div>

        {/* Jira Integration Status */}
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Jira Integration</h2>
              <p className="text-sm text-gray-600 mt-1">
                {jiraIntegration
                  ? `Connected to ${jiraIntegration.instance_url}`
                  : 'Not connected'}
              </p>
            </div>
            {jiraIntegration ? (
              <JiraSyncButton />
            ) : (
              <Link
                href="/integrations"
                className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100"
              >
                Connect Jira
              </Link>
            )}
          </div>

          {jiraIntegration && (
            <div className="pt-4 border-t border-gray-200">
              <JiraFieldDiscovery />
            </div>
          )}
        </div>

        {!jiraIntegration && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <p className="text-blue-900 font-medium mb-2">Connect Jira to Get Started</p>
            <p className="text-sm text-blue-700">
              Link your Jira instance to track tickets and sync friction themes with your product roadmap
            </p>
          </div>
        )}

        {jiraIntegration && (
          <>
            {/* Friction Themes Needing Tickets */}
            <div className="mb-8">
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Friction Themes Needing Tickets</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {accountsWithUnlinkedThemes.length} accounts have friction themes without linked Jira tickets
                  </p>
                </div>

                <div className="divide-y divide-gray-200">
                  {accountsWithUnlinkedThemes.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <p className="text-sm">All friction themes are linked to Jira tickets</p>
                    </div>
                  ) : (
                    accountsWithUnlinkedThemes.map(account => (
                      <div key={account.id} className="p-6 hover:bg-gray-50">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <Link
                              href={`/accounts/${account.id}`}
                              className="text-base font-semibold text-gray-900 hover:text-purple-700"
                            >
                              {account.name}
                            </Link>
                            <p className="text-sm text-gray-600 mt-1">
                              ARR: ${(account.arr || 0).toLocaleString()} • {account.totalUnlinkedCases} untracked cases
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {account.unlinkedThemes.map((theme: any) => (
                            <div
                              key={theme.theme_key}
                              className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium text-amber-900">
                                  {THEME_LABELS[theme.theme_key] || theme.theme_key}
                                </p>
                                <p className="text-xs text-amber-700 mt-0.5">
                                  {theme.case_count} case{theme.case_count !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <Link
                                href={`/accounts/${account.id}?tab=themes&theme=${theme.theme_key}`}
                                className="text-xs text-amber-700 hover:text-amber-900 flex items-center gap-1"
                              >
                                View cases
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Accounts with Linked Tickets */}
            <div>
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Active Jira Tickets</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Tickets linked to account friction themes
                  </p>
                </div>

                <div className="divide-y divide-gray-200">
                  {!accountsWithTickets || accountsWithTickets.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <p className="text-sm">No Jira tickets linked to accounts yet</p>
                    </div>
                  ) : (
                    accountsWithTickets.map(account => {
                      const links = account.account_jira_links || [];
                      if (links.length === 0) return null;

                      return (
                        <div key={account.id} className="p-6 hover:bg-gray-50">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <Link
                                href={`/accounts/${account.id}`}
                                className="text-base font-semibold text-gray-900 hover:text-purple-700"
                              >
                                {account.name}
                              </Link>
                              <p className="text-sm text-gray-600 mt-1">
                                ARR: ${(account.arr || 0).toLocaleString()} • {links.length} ticket{links.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {links.map((link: any) => {
                              const issue = link.jira_issue;
                              if (!issue) return null;

                              const statusColor =
                                issue.status === 'Done' ? 'bg-green-100 text-green-800' :
                                issue.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800';

                              const priorityColor =
                                issue.priority === 'Highest' || issue.priority === 'High' ? 'text-red-600' :
                                issue.priority === 'Medium' ? 'text-orange-600' :
                                'text-gray-600';

                              return (
                                <div
                                  key={issue.key}
                                  className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                                >
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <a
                                          href={issue.jira_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sm font-medium text-purple-700 hover:text-purple-900 flex items-center gap-1"
                                        >
                                          {issue.key}
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                        {issue.issue_type && (
                                          <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                                            {issue.issue_type}
                                          </span>
                                        )}
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>
                                          {issue.status}
                                        </span>
                                        {issue.priority && (
                                          <span className={`text-xs font-medium ${priorityColor}`}>
                                            {issue.priority}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm text-gray-700 mb-2">
                                        {issue.summary}
                                      </p>

                                      {/* Additional metadata */}
                                      <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                                        {issue.components && issue.components.length > 0 && (
                                          <div className="flex items-center gap-1">
                                            <span className="font-medium">Components:</span>
                                            <span>{issue.components.join(', ')}</span>
                                          </div>
                                        )}
                                        {issue.fix_versions && issue.fix_versions.length > 0 && (
                                          <div className="flex items-center gap-1">
                                            <span className="font-medium">Fix Version:</span>
                                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                              {issue.fix_versions[0]}
                                            </span>
                                          </div>
                                        )}
                                        {issue.parent_key && (
                                          <div className="flex items-center gap-1">
                                            <span className="font-medium">Parent:</span>
                                            <span>{issue.parent_key}</span>
                                          </div>
                                        )}
                                        {issue.resolution && (
                                          <div className="flex items-center gap-1">
                                            <span className="font-medium">Resolution:</span>
                                            <span className="text-green-600">{issue.resolution}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
