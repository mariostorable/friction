'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ExternalLink, CheckCircle, X, Eye, EyeOff } from 'lucide-react';
import ErrorToast from './ErrorToast';
import SuccessToast from './SuccessToast';

export default function JiraConnector() {
  const [integration, setIntegration] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Form state
  const [jiraUrl, setJiraUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Toast state
  const [error, setError] = useState<{ title: string; message: string; details?: string } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    checkIntegration();
  }, []);

  async function checkIntegration() {
    const { data } = await supabase
      .from('integrations')
      .select('*')
      .eq('integration_type', 'jira')
      .eq('status', 'active')
      .single();

    setIntegration(data);
    setLoading(false);
  }

  async function connectJira() {
    setConnecting(true);
    try {
      const response = await fetch('/api/jira/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jiraUrl, email, apiToken }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess('Successfully connected to Jira!');
        await checkIntegration();
        // Clear form
        setJiraUrl('');
        setEmail('');
        setApiToken('');
      } else {
        setError({
          title: 'Failed to connect',
          message: result.error || 'Unknown error occurred',
          details: result.details
        });
      }
    } catch (error) {
      console.error('Connect error:', error);
      setError({
        title: 'Connection Error',
        message: 'Failed to connect to Jira',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!confirm('Are you sure you want to disconnect Jira? This will delete all synced issues.')) {
      return;
    }

    try {
      const response = await fetch('/api/jira/disconnect', {
        method: 'POST',
      });

      if (response.ok) {
        setSuccess('Jira disconnected successfully');
        setIntegration(null);
      } else {
        setError({
          title: 'Disconnect Failed',
          message: 'Failed to disconnect from Jira'
        });
      }
    } catch (error) {
      console.error('Disconnect error:', error);
      setError({
        title: 'Disconnect Error',
        message: 'Failed to disconnect from Jira',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const response = await fetch('/api/jira/sync', {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        const totalMsg = result.total_available > result.synced
          ? ` (${result.total_available} total available - rerun sync to get more)`
          : ` (all ${result.total_available} available)`;
        setSuccess(`Successfully synced ${result.synced} Jira issues${totalMsg}! Theme links created: ${result.links_created}`);
        await checkIntegration();
      } else {
        setError({
          title: 'Sync Failed',
          message: result.error || 'Failed to sync Jira issues',
          details: result.details
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      setError({
        title: 'Sync Error',
        message: 'Failed to sync Jira issues',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded-lg"></div>;
  }

  if (integration) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-green-900">Jira Connected</h3>
            <p className="text-sm text-green-700 mt-1">{integration.instance_url}</p>
            <p className="text-xs text-green-600 mt-1">
              Email: {integration.metadata?.email}
            </p>
            <p className="text-xs text-green-600 mt-1">
              Last synced: {integration.last_synced_at
                ? new Date(integration.last_synced_at).toLocaleString()
                : 'Never'}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="text-xs text-green-700 font-medium">Encrypted</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={syncNow}
              disabled={syncing}
              className="px-4 py-2 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={disconnect}
              className="px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Connect Jira</h3>
          <p className="text-sm text-gray-600 mb-4">
            Link your Jira account to track which friction themes are being addressed
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Jira URL
          </label>
          <input
            type="text"
            value={jiraUrl}
            onChange={(e) => setJiraUrl(e.target.value)}
            placeholder="yourcompany.atlassian.net"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Your Atlassian Cloud domain
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourcompany.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Your Atlassian account email
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Token
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Your Jira API token"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Generate at{' '}
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Atlassian Account Settings
            </a>
          </p>
        </div>

        <button
          onClick={connectJira}
          disabled={connecting || !jiraUrl || !email || !apiToken}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
        >
          {connecting ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <ExternalLink className="w-5 h-5" />
              Connect to Jira
            </>
          )}
        </button>
      </div>

      {error && (
        <ErrorToast
          title={error.title}
          message={error.message}
          details={error.details}
          onClose={() => setError(null)}
        />
      )}
      {success && (
        <SuccessToast
          message={success}
          onClose={() => setSuccess(null)}
        />
      )}
    </div>
  );
}
