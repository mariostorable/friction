'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ExternalLink, CheckCircle, X } from 'lucide-react';
import ErrorToast from './ErrorToast';
import SuccessToast from './SuccessToast';

export default function SalesforceConnector() {
  const [integration, setIntegration] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

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
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .single();
    
    setIntegration(data);
    setLoading(false);
  }

  async function disconnect() {
    if (!confirm('Are you sure you want to disconnect Salesforce?')) {
      return;
    }

    try {
      await supabase.from('oauth_tokens').delete().eq('integration_id', integration.id);
      await supabase.from('integrations').delete().eq('id', integration.id);
      setSuccess('Salesforce disconnected successfully');
      setIntegration(null);
    } catch (error) {
      console.error('Disconnect error:', error);
      setError({
        title: 'Disconnect Error',
        message: 'Failed to disconnect from Salesforce',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/salesforce/sync', {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        let message = `✓ Salesforce Sync Complete!\n\n`;
        message += `Accounts synced: ${result.synced}\n`;

        if (result.portfolios) {
          message += `Storage accounts: ${result.portfolios.storage || 0}\n`;
          message += `Marine accounts: ${result.portfolios.marine || 0}\n`;
        }

        if (result.geocoded !== undefined) {
          message += `Geocoded (for Visit Planner): ${result.geocoded}\n`;
        }

        // Include analysis status if provided
        if (result.message) {
          message += `\n${result.message}`;
        }

        message += `\n\nAddress/location data has been updated.\nRefresh the dashboard to see latest data.`;

        setSuccess(message);
        await checkIntegration();
      } else {
        setError({
          title: 'Sync Failed',
          message: result.error || 'Failed to sync Salesforce data',
          details: result.debug ? JSON.stringify(result.debug, null, 2) : undefined
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      setError({
        title: 'Sync Error',
        message: 'Failed to sync Salesforce data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setSyncing(false);
    }
  }

  async function connectSalesforce() {
    const clientId = process.env.NEXT_PUBLIC_SALESFORCE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/auth/salesforce/callback`;
    
    const authUrl = `https://storable.my.salesforce.com/services/oauth2/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=api%20refresh_token`;
    
    window.location.href = authUrl;
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded-lg"></div>;
  }

  if (integration) {
    return (
      <>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-green-900">Salesforce Connected</h3>
              <p className="text-sm text-green-700 mt-1">{integration.instance_url}</p>
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
            autoClose={!success.includes('synced')} // Don't auto-close sync messages
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Connect Salesforce</h3>
            <p className="text-sm text-gray-600 mb-4">
              Connect your Salesforce account to start tracking friction
            </p>
            <button
              onClick={connectSalesforce}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <ExternalLink className="w-5 h-5" />
              Connect to Salesforce
            </button>
          </div>
        </div>
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
          autoClose={!success.includes('synced')} // Don't auto-close sync messages
        />
      )}
    </>
  );
}
