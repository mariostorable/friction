'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Minus, Settings, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { AccountWithMetrics } from '@/types';
import PortfolioSummary from '@/components/PortfolioSummary';
import FavoritesTab from '@/components/FavoritesTab';
import ReportsHub from '@/components/ReportsHub';
import ThemesTab from '@/components/ThemesTab';
import JiraSyncButton from '@/components/JiraSyncButton';
import JiraPortfolioOverview from '@/components/JiraPortfolioOverview';

export default function Dashboard() {
  const [top25, setTop25] = useState<AccountWithMetrics[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [accountsAnalyzedToday, setAccountsAnalyzedToday] = useState(0);
  const [totalPortfolioAccounts, setTotalPortfolioAccounts] = useState(0);
  const [portfolioCaseVolumeAvg, setPortfolioCaseVolumeAvg] = useState(0);
  const [portfolioCasesPerFacilityAvg, setPortfolioCasesPerFacilityAvg] = useState(0);
  const [activeTab, setActiveTab] = useState<'portfolios' | 'favorites' | 'reports' | 'themes'>('portfolios');
  const [analyzedAccountNames, setAnalyzedAccountNames] = useState<string[]>([]);
  const [pendingAccountNames, setPendingAccountNames] = useState<string[]>([]);
  const [showSyncTooltip, setShowSyncTooltip] = useState(false);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('arr');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [softwareFilter, setSoftwareFilter] = useState<'all' | 'edge' | 'sitelink'>('all');
  const [businessUnit, setBusinessUnit] = useState<'all' | 'storage' | 'marine'>('storage');
  const [isSalesforceConnected, setIsSalesforceConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [hoveredCaseIcon, setHoveredCaseIcon] = useState<string | null>(null);
  const [jiraTicketCounts, setJiraTicketCounts] = useState<Record<string, { resolved_7d: number; in_progress: number; open: number }>>({});
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const supabase = createClientComponentClient();
  const router = useRouter();

  // Handle URL parameters for tab and theme navigation
  useEffect(() => {
    // Read URL params manually to avoid SSR issues
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      const theme = params.get('theme');

      if (tab === 'themes') {
        setActiveTab('themes');
        if (theme) {
          setSelectedTheme(theme);
        }
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    checkSalesforceConnection();
  }, []);

  async function checkSalesforceConnection() {
    try {
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('integration_type', 'salesforce')
        .eq('status', 'active')
        .single();

      setIsSalesforceConnected(!!integration);
    } catch (error) {
      setIsSalesforceConnected(false);
    } finally {
      setCheckingConnection(false);
    }
  }

  async function loadDashboard() {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/');
        return;
      }

      const { data: portfolios } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // Load Storage and Marine portfolios
      const storagePortfolio = portfolios?.find(p => p.portfolio_type === 'top_25_edge'); // Renamed from EDGE but keeping type for compatibility
      const marinePortfolio = portfolios?.find(p => p.portfolio_type === 'top_25_marine');

      // Combine account IDs from both portfolios (remove duplicates)
      const allAccountIds = [
        ...(storagePortfolio?.account_ids || []),
        ...(marinePortfolio?.account_ids || [])
      ];
      const uniqueAccountIds = Array.from(new Set(allAccountIds));

      if (uniqueAccountIds.length > 0) {
        const accountIds = uniqueAccountIds;
        const { data: accounts } = await supabase
          .from('accounts')
          .select(`
            *,
            current_snapshot:account_snapshots!account_snapshots_account_id_fkey(
              ofi_score,
              trend_direction,
              top_themes,
              case_volume,
              created_at
            ),
            vitally_account:vitally_accounts!vitally_accounts_account_id_fkey(
              vitally_account_id
            )
          `)
          .in('id', accountIds)
          .eq('status', 'active')
          .order('arr', { ascending: false });

        if (accounts) {
          const accountsWithSnapshot = accounts.map(acc => ({
            ...acc,
            current_snapshot: Array.isArray(acc.current_snapshot)
              ? acc.current_snapshot.sort((a: any, b: any) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )[0]
              : acc.current_snapshot
          })).filter(a => a.name !== 'Test');

          setTop25(accountsWithSnapshot);
          setTotalPortfolioAccounts(accountsWithSnapshot.length); // Use filtered count, not raw count

          // Count how many accounts have snapshots from today
          const today = new Date().toISOString().split('T')[0];
          const { data: todaySnapshots } = await supabase
            .from('account_snapshots')
            .select('account_id')
            .in('account_id', accountIds)
            .eq('snapshot_date', today);

          const analyzedIds = new Set(todaySnapshots?.map(s => s.account_id) || []);
          const analyzed = accountsWithSnapshot.filter(a => analyzedIds.has(a.id)).map(a => a.name);
          const pending = accountsWithSnapshot.filter(a => !analyzedIds.has(a.id)).map(a => a.name);

          setAccountsAnalyzedToday(todaySnapshots?.length || 0);
          setAnalyzedAccountNames(analyzed);
          setPendingAccountNames(pending);

          // Get the most recent snapshot time for "last analyzed" display
          if (todaySnapshots && todaySnapshots.length > 0) {
            const { data: recentSnapshot } = await supabase
              .from('account_snapshots')
              .select('created_at')
              .in('account_id', accountIds)
              .eq('snapshot_date', today)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            if (recentSnapshot) {
              setLastAnalysisTime(recentSnapshot.created_at);
            }
          }

          // Calculate portfolio-wide case volume average
          const { data: allSnapshots } = await supabase
            .from('account_snapshots')
            .select('case_volume')
            .in('account_id', accountIds)
            .gte('snapshot_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

          if (allSnapshots && allSnapshots.length > 0) {
            const avgVolume = allSnapshots.reduce((sum, s) => sum + (s.case_volume || 0), 0) / allSnapshots.length;
            setPortfolioCaseVolumeAvg(avgVolume);
          }

          // Calculate portfolio-wide cases per facility average
          const accountsWithFacilities = accountsWithSnapshot.filter(a => a.facility_count && a.facility_count > 0 && a.current_snapshot?.case_volume !== undefined);
          if (accountsWithFacilities.length > 0) {
            const totalCasesPerFacility = accountsWithFacilities.reduce((sum, a) => {
              const casesPerFacility = (a.current_snapshot?.case_volume || 0) / (a.facility_count || 1);
              return sum + casesPerFacility;
            }, 0);
            const avgCasesPerFacility = totalCasesPerFacility / accountsWithFacilities.length;
            setPortfolioCasesPerFacilityAvg(avgCasesPerFacility);
          }

          // Fetch active alert counts for each account
          const { data: alerts } = await supabase
            .from('alerts')
            .select('account_id')
            .in('account_id', accountIds)
            .eq('dismissed', false);

          // Count alerts per account (even if 0)
          const alertCounts = (alerts || []).reduce((acc: any, alert: any) => {
            acc[alert.account_id] = (acc[alert.account_id] || 0) + 1;
            return acc;
          }, {});

          // Fetch Jira ticket counts for each account
          try {
            const jiraResponse = await fetch('/api/jira/portfolio-stats');
            if (jiraResponse.ok) {
              const jiraData = await jiraResponse.json();
              setJiraTicketCounts(jiraData.accountTicketCounts || {});
            }
          } catch (error) {
            console.error('Error fetching Jira ticket counts:', error);
          }

          // Add alert counts to accounts (always, even if all are 0)
          const accountsWithAlerts = accountsWithSnapshot.map(acc => ({
            ...acc,
            alert_count: alertCounts[acc.id] || 0
          }));
          setTop25(accountsWithAlerts);
        }
      }

      await loadFavorites();
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadFavorites() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('favorites')
      .select(`
        *,
        account:accounts(*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setFavorites(data || []);
  }

  async function syncSalesforce() {
    // Double-check connection before syncing
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .single();

    if (!integration) {
      alert('⚠️ Salesforce Not Connected\n\nYou need to connect your Salesforce account first.\n\n1. Click on Settings (top right)\n2. Connect to Salesforce\n3. Come back here and click "Sync from Salesforce"');
      router.push('/settings');
      return;
    }

    setSyncing(true);
    setSyncProgress('Syncing account data from Salesforce...');

    try {
      const response = await fetch('/api/salesforce/sync', {
        method: 'POST',
      });

      if (!response.ok) {
        let errorData;
        let errorText = '';

        try {
          const responseText = await response.text();
          errorText = responseText;
          errorData = JSON.parse(responseText);
          console.error('Sync API error - Status:', response.status, 'Data:', errorData);
        } catch (parseError) {
          console.error('Failed to parse error response:', errorText);
          errorData = { error: 'Invalid error response from server' };
        }

        // Check if Salesforce is not connected
        if (errorData.error === 'Salesforce not connected' || errorData.error === 'No tokens found') {
          alert('⚠️ Salesforce Connection Issue\n\nYour Salesforce connection may have expired or is not properly configured.\n\n1. Go to Settings (top right)\n2. Reconnect to Salesforce\n3. Come back here and try syncing again');
          router.push('/settings');
          setSyncing(false);
          return;
        }

        // Create detailed error message
        const errorMsg = errorData.error || errorData.message || `HTTP ${response.status} error`;
        const errorDetails = errorData.details || '';
        throw new Error(`${errorMsg}${errorDetails ? ` - ${errorDetails}` : ''}`);
      }

      const result = await response.json();
      console.log('Sync result:', result);

      // Show the message from the backend
      if (result.message) {
        setSyncProgress(result.message);
      }

      // If there was an analysis error, show it
      if (result.analysisError) {
        console.error('Analysis error:', result.analysisError);
        alert(`⚠️ Analysis Failed\n\n${result.analysisError}\n\nCheck the console or Vercel logs for details.`);
      }

      // Refresh the dashboard to show updated data
      await loadDashboard();
      setSyncing(false);
      setTimeout(() => setSyncProgress(''), 10000);
      return;

    } catch (error) {
      console.error('Sync error (full):', error);
      console.error('Error type:', typeof error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Provide helpful error messages based on common issues
      let userMessage = '❌ Failed to sync with Salesforce\n\n';

      if (errorMessage.toLowerCase().includes('401') || errorMessage.toLowerCase().includes('unauthorized') || errorMessage.toLowerCase().includes('not connected')) {
        userMessage += '🔐 Authentication Issue\n\nYour Salesforce connection may have expired or is not set up.\n\n📝 Steps to fix:\n1. Click Settings (top right)\n2. Connect or reconnect to Salesforce\n3. Come back and try syncing again';
      } else if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('etimedout')) {
        userMessage += '⏱️ Connection Timeout\n\nThe request took too long - this can happen with large datasets.\n\n📝 What to do:\nJust click the sync button again to retry. Your progress is saved.';
      } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('econnrefused') || errorMessage.toLowerCase().includes('fetch')) {
        userMessage += '🌐 Network Error\n\nUnable to reach the server or Salesforce.\n\n📝 What to do:\n• Check your internet connection\n• Click the sync button to try again\n• Check browser console for details';
      } else if (errorMessage.toLowerCase().includes('rate limit')) {
        userMessage += '⚠️ Rate Limit\n\nToo many requests to Salesforce API.\n\n📝 What to do:\nWait 2-3 minutes, then click sync again.';
      } else if (errorMessage.toLowerCase().includes('invalid') || errorMessage.toLowerCase().includes('parse')) {
        userMessage += '⚠️ Server Response Error\n\nThe server returned an unexpected response.\n\n📝 What to do:\n• Try clicking sync again\n• Check your Salesforce connection in Settings\n• Contact support if this persists';
      } else {
        userMessage += `Error Details:\n${errorMessage}\n\n📝 What to do:\n• Copy this error message\n• Try clicking sync again\n• If it fails again, go to Settings → Disconnect → Reconnect Salesforce\n• Open browser console (F12) for technical details`;
      }

      alert(userMessage);
      setSyncing(false);
      setSyncProgress('');

      // Refresh connection status in case it changed
      await checkSalesforceConnection();
    }
  }

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  function getSortIcon(field: string) {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 ml-1 inline" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-4 h-4 ml-1 inline" /> : <ArrowDown className="w-4 h-4 ml-1 inline" />;
  }

  const sortAccounts = (accounts: AccountWithMetrics[]) => {
    return accounts.sort((a, b) => {
      let aVal, bVal;

      switch(sortField) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'arr':
          aVal = a.arr || 0;
          bVal = b.arr || 0;
          break;
        case 'software':
          aVal = getPrimarySoftware(a);
          bVal = getPrimarySoftware(b);
          break;
        case 'ofi':
          aVal = a.current_snapshot?.ofi_score || 0;
          bVal = b.current_snapshot?.ofi_score || 0;
          break;
        case 'case_volume':
          aVal = a.current_snapshot?.case_volume || 0;
          bVal = b.current_snapshot?.case_volume || 0;
          break;
        case 'cases_per_facility':
          aVal = (a.current_snapshot?.case_volume && a.facility_count && a.facility_count > 0)
            ? (a.current_snapshot.case_volume / a.facility_count)
            : 0;
          bVal = (b.current_snapshot?.case_volume && b.facility_count && b.facility_count > 0)
            ? (b.current_snapshot.case_volume / b.facility_count)
            : 0;
          break;
        case 'trend':
          // Sort by trend direction: worsening > stable > improving > none
          const trendOrder = { 'worsening': 3, 'stable': 2, 'improving': 1, '': 0 };
          aVal = trendOrder[a.current_snapshot?.trend_direction as keyof typeof trendOrder] || 0;
          bVal = trendOrder[b.current_snapshot?.trend_direction as keyof typeof trendOrder] || 0;
          break;
        case 'last_analyzed':
          aVal = a.current_snapshot?.created_at ? new Date(a.current_snapshot.created_at).getTime() : 0;
          bVal = b.current_snapshot?.created_at ? new Date(b.current_snapshot.created_at).getTime() : 0;
          break;
        case 'vitally_health':
          aVal = a.vitally_health_score || 0;
          bVal = b.vitally_health_score || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const getTrendIcon = (direction?: string) => {
    if (direction === 'worsening') return <TrendingUp className="w-4 h-4 text-red-500" />;
    if (direction === 'improving') return <TrendingDown className="w-4 h-4 text-green-500" />;
    if (direction === 'stable') return <span className="text-gray-500 text-xs">Stable</span>;
    return <span className="text-gray-400 text-xs">—</span>;
  };

  // Determine primary software provider for an account
  const getPrimarySoftware = (account: AccountWithMetrics): 'EDGE' | 'SiteLink' | 'N/A' => {
    const products = account.products || '';

    const hasEDGE = products.includes('EDGE') || products.includes('Storable Edge');
    const hasSiteLink = products.includes('SiteLink');

    // If both are in the products string, prioritize EDGE (Storable's newer platform)
    if (hasEDGE && hasSiteLink) {
      return 'EDGE';
    }

    if (hasEDGE) return 'EDGE';
    if (hasSiteLink) return 'SiteLink';

    return 'N/A';
  };

  // Filter accounts by business unit
  const filterAccountsByBusinessUnit = (accounts: AccountWithMetrics[]) => {
    if (businessUnit === 'all') {
      return accounts;
    }

    return accounts.filter(account => {
      return account.vertical === businessUnit;
    });
  };

  // Filter accounts by software provider
  const filterAccountsBySoftware = (accounts: AccountWithMetrics[]) => {
    if (softwareFilter === 'all') {
      return accounts;
    }

    return accounts.filter(account => {
      const primarySoftware = getPrimarySoftware(account);
      if (softwareFilter === 'edge') {
        return primarySoftware === 'EDGE';
      }
      if (softwareFilter === 'sitelink') {
        return primarySoftware === 'SiteLink';
      }
      return false;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Friction Intelligence</h1>
              <p className="mt-1 text-sm text-gray-500">Early warning system for customer friction</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/roadmap')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Jira Roadmap
              </button>
              <button
                onClick={() => router.push('/vitally')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Customer Health
              </button>
              <button
                onClick={() => router.push('/integrations')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Integrations
              </button>
              <button
                onClick={() => router.push('/settings')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Business Unit Filter */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Business Unit:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setBusinessUnit('storage')}
                className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  businessUnit === 'storage'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Storage
              </button>
              <button
                onClick={() => setBusinessUnit('marine')}
                className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  businessUnit === 'marine'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Marine
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('portfolios')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'portfolios'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Portfolios
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'favorites'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Favorites ({favorites.length})
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'reports'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Custom Reports
            </button>
            <button
              onClick={() => setActiveTab('themes')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'themes'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Key Friction Themes
            </button>
            <button
              onClick={() => router.push('/roadmap')}
              className="px-4 py-2 rounded-lg font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              Jira Roadmap
            </button>
          </div>

          <div className="flex items-center gap-2">
            <JiraSyncButton />

            <div className="relative">
              <button
              onClick={!isSalesforceConnected ? () => router.push('/settings') : syncSalesforce}
              disabled={syncing || checkingConnection}
              onMouseEnter={() => setShowSyncTooltip(true)}
              onMouseLeave={() => setShowSyncTooltip(false)}
              className={`px-4 py-2 rounded-lg font-medium flex flex-col items-start transition-colors ${
                syncing || checkingConnection
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : !isSalesforceConnected
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : totalPortfolioAccounts === 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : accountsAnalyzedToday < totalPortfolioAccounts
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {syncing && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <span>
                  {checkingConnection
                    ? 'Checking...'
                    : syncing
                    ? 'Syncing Portfolio...'
                    : !isSalesforceConnected
                    ? 'Connect Salesforce'
                    : totalPortfolioAccounts === 0
                    ? 'Sync from Salesforce'
                    : accountsAnalyzedToday < totalPortfolioAccounts
                    ? 'Sync & Analyze All'
                    : 'All Up to Date ✓'}
                </span>
              </div>
              {!syncing && !checkingConnection && isSalesforceConnected && accountsAnalyzedToday === totalPortfolioAccounts && lastAnalysisTime && (
                <span className="text-xs opacity-90 mt-0.5">
                  Last analyzed {(() => {
                    const diffMs = Date.now() - new Date(lastAnalysisTime).getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMins / 60);
                    if (diffHours > 0) return `${diffHours}h ago`;
                    if (diffMins > 0) return `${diffMins}m ago`;
                    return 'just now';
                  })()} • Click to re-sync
                </span>
              )}
            </button>
            {!syncing && accountsAnalyzedToday < totalPortfolioAccounts && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                {totalPortfolioAccounts - accountsAnalyzedToday}
              </span>
            )}

            {/* Sync Status Tooltip */}
            {showSyncTooltip && !isSalesforceConnected && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-orange-50 border border-orange-200 rounded-lg shadow-lg p-4 z-50">
                <div className="text-sm text-orange-900">
                  <p className="font-semibold mb-2">⚠️ Salesforce Not Connected</p>
                  <p className="text-xs">Click to go to Settings and connect your Salesforce account.</p>
                </div>
              </div>
            )}
            {showSyncTooltip && isSalesforceConnected && (analyzedAccountNames.length > 0 || pendingAccountNames.length > 0) && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50">
                <div className="space-y-3">
                  {analyzedAccountNames.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                          ✓ Analyzed Today ({analyzedAccountNames.length})
                        </span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {analyzedAccountNames.map((name) => (
                          <div key={name} className="text-xs text-gray-700 pl-3">
                            • {name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {pendingAccountNames.length > 0 && (
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                          ⏳ Needs Analysis ({pendingAccountNames.length})
                        </span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {pendingAccountNames.map((name) => (
                          <div key={name} className="text-xs text-gray-700 pl-3">
                            • {name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                  Click "Sync & Analyze All" to process all pending accounts. Runs automatically every hour.
                </div>
              </div>
            )}
          </div>
          </div>
        </div>

        {syncProgress && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">{syncProgress}</p>
          </div>
        )}

        {activeTab === 'portfolios' && (
          <>
            {top25.length === 0 && (
              <div className="max-w-2xl mx-auto">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-8 text-center">
                  <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Friction Intelligence!</h2>
                    <p className="text-gray-600 mb-6">Let's get your Salesforce accounts connected</p>
                  </div>

                  <div className="bg-white rounded-lg p-6 mb-6 text-left">
                    <h3 className="font-semibold text-gray-900 mb-4">Getting Started:</h3>
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">1</span>
                        <div className="flex-1">
                          <span className="text-gray-700">Go to <strong>Settings</strong> (top right) and connect your Salesforce account</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">2</span>
                        <div className="flex-1">
                          <span className="text-gray-700">Come back here and click "Sync from Salesforce" to import your accounts</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">3</span>
                        <div className="flex-1">
                          <span className="text-gray-700">Your accounts will be automatically synced and analyzed by end of day</span>
                        </div>
                      </li>
                    </ol>
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-800">
                        <strong>💡 Want insights now?</strong> After syncing, visit any account page and click "Analyze Friction" to jumpstart the analysis for that specific account.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => router.push('/settings')}
                    className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Go to Settings to Connect
                  </button>

                  <p className="text-sm text-gray-500 mt-4">Once connected, your data syncs automatically • You control when to analyze</p>
                </div>
              </div>
            )}

            {top25.length > 0 && (
              <PortfolioSummary
                top25={filterAccountsBySoftware(filterAccountsByBusinessUnit(top25))}
                singleOperator={[]}
              />
            )}

            {/* Jira Portfolio Overview */}
            <div className="mt-6">
              <JiraPortfolioOverview />
            </div>

            <section className="mt-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {businessUnit === 'storage' ? 'Storage Accounts (EDGE & SiteLink)' : 'Marine Accounts'}
                </h2>
                <div className="flex items-center gap-2">
                  {businessUnit !== 'marine' && (
                    <>
                      <label htmlFor="software-filter" className="text-sm font-medium text-gray-700">
                        Filter by:
                      </label>
                      <select
                        id="software-filter"
                        value={softwareFilter}
                        onChange={(e) => setSoftwareFilter(e.target.value as 'all' | 'edge' | 'sitelink')}
                        className="block w-40 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">All Software</option>
                        <option value="edge">EDGE Only</option>
                        <option value="sitelink">SiteLink Only</option>
                      </select>
                    </>
                  )}
                  <span className="text-sm text-gray-600">
                    Showing {filterAccountsBySoftware(filterAccountsByBusinessUnit(top25)).length} of {top25.length} accounts
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200">
                <table className="w-full divide-y divide-gray-200 table-fixed">
                  <thead className="bg-gray-50">
                    <tr>
                      <th onClick={() => handleSort('name')} className="w-[28%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100">
                        Account {getSortIcon('name')}
                      </th>
                      <th onClick={() => handleSort('arr')} className="w-[8%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100">
                        ARR {getSortIcon('arr')}
                      </th>
                      <th onClick={() => handleSort('software')} className="w-[8%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100">
                        SW {getSortIcon('software')}
                      </th>
                      <th onClick={() => handleSort('ofi')} className="w-[7%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100">
                        OFI {getSortIcon('ofi')}
                      </th>
                      <th
                        onClick={() => handleSort('case_volume')}
                        onMouseEnter={() => setHoveredColumn('case_volume')}
                        onMouseLeave={() => setHoveredColumn(null)}
                        className="w-[10%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100 relative"
                      >
                        <div className="flex items-center gap-1">
                          Cases (90d) {getSortIcon('case_volume')}
                        </div>
                        {hoveredColumn === 'case_volume' && (
                          <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal normal-case font-normal">
                            Total number of Salesforce cases for this account in the last 90 days
                            <div className="absolute -top-1 left-6 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                          </div>
                        )}
                      </th>
                      <th
                        onClick={() => handleSort('cases_per_facility')}
                        onMouseEnter={() => setHoveredColumn('cases_per_facility')}
                        onMouseLeave={() => setHoveredColumn(null)}
                        className="w-[10%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100 relative"
                      >
                        <div className="flex items-center gap-1">
                          Per Loc (90d) {getSortIcon('cases_per_facility')}
                        </div>
                        {hoveredColumn === 'cases_per_facility' && (
                          <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal normal-case font-normal">
                            Average cases per facility location over 90 days. Normalizes case volume across different-sized accounts. Anything above the portfolio average may indicate friction.
                            <div className="absolute -top-1 left-6 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                          </div>
                        )}
                      </th>
                      <th onClick={() => handleSort('trend')} className="w-[7%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100">
                        Trend {getSortIcon('trend')}
                      </th>
                      <th onClick={() => handleSort('last_analyzed')} className="w-[11%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight cursor-pointer hover:bg-gray-100">
                        Last Analyzed {getSortIcon('last_analyzed')}
                      </th>
                      <th
                        onMouseEnter={() => setHoveredColumn('vitally_health')}
                        onMouseLeave={() => setHoveredColumn(null)}
                        className="w-[8%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight relative cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('vitally_health')}
                      >
                        <div className="flex items-center gap-1">
                          Vitally {getSortIcon('vitally_health')}
                        </div>
                        {hoveredColumn === 'vitally_health' && (
                          <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal normal-case font-normal">
                            Customer health score from Vitally (0-100). Higher scores indicate healthier accounts.
                            <div className="absolute -top-1 left-6 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                          </div>
                        )}
                      </th>
                      <th
                        onMouseEnter={() => setHoveredColumn('jira_tickets')}
                        onMouseLeave={() => setHoveredColumn(null)}
                        className="w-[14%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight relative"
                      >
                        <div className="flex items-center gap-1">
                          Jira Tickets
                        </div>
                        {hoveredColumn === 'jira_tickets' && (
                          <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal normal-case font-normal">
                            Product roadmap tickets linked to this account's friction themes. Shows resolved (7d) / in progress / open.
                            <div className="absolute -top-1 left-6 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                          </div>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortAccounts(filterAccountsBySoftware(filterAccountsByBusinessUnit(top25))).map((account) => (
                      <tr
                        key={account.id}
                        onClick={() => router.push(`/account/${account.id}`)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-3 py-3">
                          <div className="text-sm font-medium text-gray-900 line-clamp-2" title={account.name}>{account.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{account.segment}</div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">
                          ${(account.arr || 0) >= 1000000 ? `${((account.arr || 0) / 1000000).toFixed(1)}M` : `${Math.round((account.arr || 0) / 1000)}K`}
                        </td>
                        <td className="px-2 py-2 text-xs text-gray-900">
                          {getPrimarySoftware(account)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {account.current_snapshot?.ofi_score ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              account.current_snapshot.ofi_score >= 70
                                ? 'bg-red-100 text-red-800'
                                : account.current_snapshot.ofi_score >= 40
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {account.current_snapshot.ofi_score}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs">
                          {account.current_snapshot?.case_volume !== undefined ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-900 font-medium">{account.current_snapshot.case_volume}</span>
                              {portfolioCaseVolumeAvg > 0 && account.current_snapshot.case_volume > portfolioCaseVolumeAvg * 1.5 && (
                                <div
                                  className="relative inline-block"
                                  onMouseEnter={() => setHoveredCaseIcon(`high-${account.id}`)}
                                  onMouseLeave={() => setHoveredCaseIcon(null)}
                                >
                                  <span className="text-xs text-red-600 font-medium cursor-help">⚠️</span>
                                  {hoveredCaseIcon === `high-${account.id}` && (
                                    <div className="absolute left-0 top-full mt-1 w-56 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal">
                                      High volume: 50%+ above portfolio average ({Math.round(portfolioCaseVolumeAvg)} cases)
                                      <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {portfolioCaseVolumeAvg > 0 && account.current_snapshot.case_volume < portfolioCaseVolumeAvg * 0.5 && (
                                <div
                                  className="relative inline-block"
                                  onMouseEnter={() => setHoveredCaseIcon(`low-${account.id}`)}
                                  onMouseLeave={() => setHoveredCaseIcon(null)}
                                >
                                  <span className="text-xs text-yellow-600 cursor-help">⬇️</span>
                                  {hoveredCaseIcon === `low-${account.id}` && (
                                    <div className="absolute left-0 top-full mt-1 w-56 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal">
                                      Low volume: 50%+ below portfolio average ({Math.round(portfolioCaseVolumeAvg)} cases)
                                      <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs">
                          {account.current_snapshot?.case_volume !== undefined && account.facility_count && account.facility_count > 0 ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-900 font-medium">
                                {(account.current_snapshot.case_volume / account.facility_count).toFixed(1)}
                              </span>
                              <div
                                className="relative inline-block"
                                onMouseEnter={() => setHoveredCaseIcon(`facility-${account.id}`)}
                                onMouseLeave={() => setHoveredCaseIcon(null)}
                              >
                                <span className="text-[10px] text-gray-500 cursor-help">({account.facility_count})</span>
                                {hoveredCaseIcon === `facility-${account.id}` && (
                                  <div className="absolute left-0 top-full mt-1 w-56 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal">
                                    <div className="font-semibold mb-1">{account.name}</div>
                                    <div className="text-gray-300">
                                      {account.facility_count} facilit{account.facility_count === 1 ? 'y' : 'ies'} / location{account.facility_count === 1 ? '' : 's'}
                                    </div>
                                    <div className="mt-2 text-gray-400 italic text-[10px]">
                                      Individual facility names available in Salesforce
                                    </div>
                                    <div className="absolute -top-1 left-8 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                                  </div>
                                )}
                              </div>
                              {portfolioCasesPerFacilityAvg > 0 && (account.current_snapshot.case_volume / account.facility_count) > portfolioCasesPerFacilityAvg * 1.3 && (
                                <div
                                  className="relative inline-block"
                                  onMouseEnter={() => setHoveredCaseIcon(`per-facility-high-${account.id}`)}
                                  onMouseLeave={() => setHoveredCaseIcon(null)}
                                >
                                  <span className="text-xs text-orange-600 font-medium cursor-help">⚠️</span>
                                  {hoveredCaseIcon === `per-facility-high-${account.id}` && (
                                    <div className="absolute left-0 top-full mt-1 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal">
                                      Above normal: 30%+ above portfolio average ({portfolioCasesPerFacilityAvg.toFixed(1)} cases/location). May indicate friction.
                                      <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : account.facility_count === 0 ? (
                            <span className="text-xs text-gray-400">No facilities</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-center">
                          {getTrendIcon(account.current_snapshot?.trend_direction)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500">
                          {account.current_snapshot?.created_at
                            ? new Date(account.current_snapshot.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
                            : 'Never'}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {account.vitally_health_score !== null && account.vitally_health_score !== undefined ? (
                            <div className="flex items-center gap-1">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    // Handle both 0-10 and 0-100 scales: normalize to 0-10 for thresholds
                                    (() => {
                                      const normalizedScore = account.vitally_health_score > 20
                                        ? account.vitally_health_score / 10
                                        : account.vitally_health_score;
                                      return normalizedScore >= 8
                                        ? 'bg-green-100 text-green-800'
                                        : normalizedScore >= 4
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-red-100 text-red-800';
                                    })()
                                  }`}>
                                    {/* Display on 0-10 scale with 1 decimal */}
                                    {(account.vitally_health_score > 20
                                      ? account.vitally_health_score / 10
                                      : account.vitally_health_score
                                    ).toFixed(1)}
                                  </span>
                                  {account.vitally_account && Array.isArray(account.vitally_account) && account.vitally_account[0]?.vitally_account_id && (
                                    <a
                                      href={`https://storable.vitally.io/organizations/${account.vitally_account[0].vitally_account_id}/dashboards/0d207a3e-975b-45a2-821c-90b3287a92d7`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-blue-600 hover:text-blue-800"
                                      title="View in Vitally"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                {account.vitally_status && (
                                  <span className="text-[10px] text-gray-600 mt-0.5">
                                    {account.vitally_status}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs">
                          {jiraTicketCounts[account.id] ? (
                            <div className="flex items-center gap-1">
                              <span className="text-green-700 font-medium" title="Resolved (7 days)">
                                {jiraTicketCounts[account.id].resolved_7d}
                              </span>
                              <span className="text-gray-300">/</span>
                              <span className="text-blue-700 font-medium" title="In Progress">
                                {jiraTicketCounts[account.id].in_progress}
                              </span>
                              <span className="text-gray-300">/</span>
                              <span className="text-gray-600 font-medium" title="Open">
                                {jiraTicketCounts[account.id].open}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeTab === 'favorites' && (
          <FavoritesTab 
            favorites={favorites}
            onUpdate={loadFavorites}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsHub
            allAccounts={filterAccountsByBusinessUnit(top25)}
          />
        )}

        {activeTab === 'themes' && (
          <ThemesTab
            accounts={filterAccountsByBusinessUnit(top25)}
            initialExpandedTheme={selectedTheme}
          />
        )}
      </main>
    </div>
  );
}
