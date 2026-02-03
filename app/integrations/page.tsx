'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, Settings, ExternalLink, Activity, RefreshCw } from 'lucide-react';

interface Integration {
  id: string;
  integration_type: string;
  status: 'active' | 'expired' | 'error' | 'inactive';
  instance_url: string | null;
  connected_at: string;
  last_synced_at: string | null;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: string; message: string } | null>(null);
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadIntegrations();
  }, []);

  async function loadIntegrations() {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .order('connected_at', { ascending: false });

      if (error) throw error;
      setIntegrations(data || []);
    } catch (error) {
      console.error('Error loading integrations:', error);
    } finally {
      setLoading(false);
    }
  }

  async function syncIntegration(integrationType: string) {
    setSyncing(integrationType);
    setSyncMessage(null);

    try {
      const syncEndpoints: Record<string, string> = {
        salesforce: '/api/salesforce/sync',
        jira: '/api/jira/sync',
        vitally: '/api/vitally/sync',
      };

      const endpoint = syncEndpoints[integrationType];
      if (!endpoint) {
        setSyncMessage({ type: 'error', message: 'Sync not available for this integration' });
        setSyncing(null);
        return;
      }

      // Add timeout for long-running syncs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (response.ok) {
        setSyncMessage({
          type: 'success',
          message: data.message || `Successfully synced ${integrationType}`
        });
        // Reload integrations to get updated last_synced_at
        await loadIntegrations();
      } else {
        setSyncMessage({
          type: 'error',
          message: data.error || `Failed to sync ${integrationType}`
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setSyncMessage({
          type: 'error',
          message: 'Sync timeout: The sync is taking longer than expected. It may still be processing in the background. Please refresh in a minute.'
        });
      } else {
        setSyncMessage({
          type: 'error',
          message: error instanceof Error ? error.message : 'Sync failed'
        });
      }
    } finally {
      setSyncing(null);
    }
  }

  const integrationInfo: Record<string, { name: string; description: string; icon: string; pageLink?: string }> = {
    salesforce: {
      name: 'Salesforce',
      description: 'Sync accounts, cases, and support data for friction analysis',
      icon: '⚡',
      pageLink: undefined
    },
    jira: {
      name: 'Jira',
      description: 'Link friction themes to product roadmap tickets',
      icon: '🎯',
      pageLink: '/roadmap'
    },
    vitally: {
      name: 'Vitally',
      description: 'Customer health scores, NPS, and engagement metrics',
      icon: '💚',
      pageLink: '/vitally'
    },
    zendesk: {
      name: 'Zendesk',
      description: 'Import support tickets and customer conversations',
      icon: '💬',
      pageLink: undefined
    },
    gong: {
      name: 'Gong',
      description: 'Analyze sales calls and customer conversations',
      icon: '🎙️',
      pageLink: undefined
    },
    slack: {
      name: 'Slack',
      description: 'Monitor customer feedback from Slack channels',
      icon: '💬',
      pageLink: undefined
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Active
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <XCircle className="w-3 h-3" />
            Expired
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" />
            Error
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <XCircle className="w-3 h-3" />
            Disconnected
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading integrations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
                <p className="mt-1 text-sm text-gray-500">Manage your connected data sources</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/settings')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Sync Message */}
        {syncMessage && (
          <div className={`mb-6 p-4 rounded-lg ${
            syncMessage.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <p className="text-sm font-medium">{syncMessage.message}</p>
          </div>
        )}

        {/* Summary */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-3">
                <Activity className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Integrations</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {integrations.filter(i => i.status === 'active').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-3">
                <XCircle className="w-8 h-8 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Available</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Object.keys(integrationInfo).length - integrations.filter(i => i.status === 'active').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Connected</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {integrations.filter(i => i.status !== 'inactive').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Connected Integrations */}
        {integrations.filter(i => i.status !== 'inactive').length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Connected Integrations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {integrations
                .filter(i => i.status !== 'inactive')
                .map((integration) => {
                  const info = integrationInfo[integration.integration_type] || {
                    name: integration.integration_type,
                    description: 'Custom integration',
                    icon: '🔌'
                  };
                  return (
                    <div key={integration.id} className="bg-white rounded-lg border border-gray-200 p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-3">
                          <div className="text-3xl">{info.icon}</div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{info.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{info.description}</p>
                          </div>
                        </div>
                        {getStatusBadge(integration.status)}
                      </div>

                      <div className="space-y-2 text-sm">
                        {integration.instance_url && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <ExternalLink className="w-4 h-4" />
                            <span className="truncate">{integration.instance_url}</span>
                          </div>
                        )}
                        <div className="text-gray-600">
                          Connected: {new Date(integration.connected_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                        {integration.last_synced_at && (
                          <div className="text-gray-600">
                            Last synced: {new Date(integration.last_synced_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => syncIntegration(integration.integration_type)}
                          disabled={syncing === integration.integration_type}
                          className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`w-4 h-4 ${syncing === integration.integration_type ? 'animate-spin' : ''}`} />
                          {syncing === integration.integration_type ? 'Syncing...' : 'Sync Now'}
                        </button>
                        {info.pageLink && (
                          <button
                            onClick={() => router.push(info.pageLink!)}
                            className="flex-1 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                          >
                            View Data
                          </button>
                        )}
                        <button
                          onClick={() => router.push('/settings')}
                          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100"
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Available Integrations */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Integrations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(integrationInfo)
              .filter(([type]) => !integrations.find(i => i.integration_type === type && i.status !== 'inactive'))
              .map(([type, info]) => (
                <div key={type} className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="text-3xl">{info.icon}</div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{info.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{info.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push('/settings')}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Connect
                  </button>
                </div>
              ))}
          </div>
        </div>

        {integrations.length === 0 && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-8 text-center">
            <Activity className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Integrations Yet</h2>
            <p className="text-gray-600 mb-6">
              Connect your data sources to get started with friction analysis
            </p>
            <button
              onClick={() => router.push('/settings')}
              className="px-8 py-4 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Go to Settings
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
