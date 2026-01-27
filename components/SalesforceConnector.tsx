'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ExternalLink, CheckCircle, X } from 'lucide-react';

export default function SalesforceConnector() {
  const [integration, setIntegration] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
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
      alert('Salesforce disconnected successfully');
      setIntegration(null);
    } catch (error) {
      console.error('Disconnect error:', error);
      alert('Failed to disconnect');
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const response = await fetch('/api/salesforce/sync', {
        method: 'POST',
      });
      
      const result = await response.json();
      
      if (response.ok) {
        let message = `Successfully synced ${result.synced} accounts!\nTop 25: ${result.portfolios.top25}\nRandom Sample: ${result.portfolios.randomSample}`;
        
        if (result.debug) {
          message += '\n\nDEBUG INFO:\n' + JSON.stringify(result.debug, null, 2);
        }
        
        alert(message);
        await checkIntegration();
        window.location.reload();
      } else {
        let errorMessage = `Sync failed: ${result.error}`;
        if (result.debug) {
          errorMessage += '\n\nDEBUG:\n' + JSON.stringify(result.debug, null, 2);
        }
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('Failed to sync');
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
  );
}
