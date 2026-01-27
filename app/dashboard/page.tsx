'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Minus, Settings, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { AccountWithMetrics } from '@/types';
import PortfolioSummary from '@/components/PortfolioSummary';
import FavoritesTab from '@/components/FavoritesTab';
import CustomReports from '@/components/CustomReports';
import ThemesTab from '@/components/ThemesTab';

export default function Dashboard() {
  const [top25, setTop25] = useState<AccountWithMetrics[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [accountsAnalyzedToday, setAccountsAnalyzedToday] = useState(0);
  const [totalPortfolioAccounts, setTotalPortfolioAccounts] = useState(0);
  const [portfolioCaseVolumeAvg, setPortfolioCaseVolumeAvg] = useState(0);
  const [activeTab, setActiveTab] = useState<'portfolios' | 'favorites' | 'reports' | 'themes'>('portfolios');
  const [analyzedAccountNames, setAnalyzedAccountNames] = useState<string[]>([]);
  const [pendingAccountNames, setPendingAccountNames] = useState<string[]>([]);
  const [showSyncTooltip, setShowSyncTooltip] = useState(false);
  const [sortField, setSortField] = useState<string>('arr');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [softwareFilter, setSoftwareFilter] = useState<'all' | 'edge' | 'sitelink'>('all');
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    loadDashboard();
  }, []);

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

      // Load both EDGE and SiteLink portfolios
      const edgePortfolio = portfolios?.find(p => p.portfolio_type === 'top_25_edge');
      const sitelinkPortfolio = portfolios?.find(p => p.portfolio_type === 'top_25_sitelink');

      // Combine account IDs from both portfolios (remove duplicates)
      const allAccountIds = [
        ...(edgePortfolio?.account_ids || []),
        ...(sitelinkPortfolio?.account_ids || [])
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
    setSyncing(true);
    setSyncProgress('Step 1/2: Syncing account data from Salesforce...');

    // Store initial snapshot count to detect changes
    const initialSnapshotCount = accountsAnalyzedToday;

    try {
      const response = await fetch('/api/salesforce/sync', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Sync failed');

      const result = await response.json();
      setSyncProgress(`Step 2/2: Analyzing up to 3 accounts (100 cases from last 90 days)...`);

      // Get baseline snapshot count before analysis starts
      const today = new Date().toISOString().split('T')[0];
      const { data: initialSnapshots } = await supabase
        .from('account_snapshots')
        .select('id')
        .eq('snapshot_date', today);
      const initialSnapshotCount = initialSnapshots?.length || 0;

      // Poll for progress
      let attempts = 0;
      let previousCardCount = 0;
      let stableCount = 0;
      const maxAttempts = 150; // 5 minutes max (3 accounts take longer)

      const pollProgress = async () => {
        // Only count recent inputs/cards (last 10 minutes) to show current sync progress
        const recentTime = new Date(Date.now() - 600000).toISOString();

        const { data: inputs } = await supabase
          .from('raw_inputs')
          .select('id')
          .gte('created_at', recentTime);

        const { data: cards } = await supabase
          .from('friction_cards')
          .select('id')
          .gte('created_at', recentTime);

        // Check snapshots from today (they use date-based deduplication)
        const today = new Date().toISOString().split('T')[0];
        const { data: snapshots } = await supabase
          .from('account_snapshots')
          .select('id')
          .eq('snapshot_date', today);

        const totalCases = inputs?.length || 0;
        const cardsCount = cards?.length || 0;
        const accountsAnalyzed = snapshots?.length || 0;

        // If max attempts reached or we've been waiting too long, complete the sync
        if (attempts >= maxAttempts) {
          setSyncProgress('Refreshing dashboard...');
          await loadDashboard();
          const newlyAnalyzed = accountsAnalyzed - initialSnapshotCount;
          const remaining = totalPortfolioAccounts - accountsAnalyzed;
          const analyzedText = newlyAnalyzed > 0
            ? `✓ ${newlyAnalyzed} account${newlyAnalyzed > 1 ? 's' : ''} analyzed!`
            : `✓ Sync complete!`;
          setSyncProgress(remaining > 0
            ? `${analyzedText} ${remaining} accounts still need analysis.`
            : `✓ All ${totalPortfolioAccounts} accounts are up to date!`);
          setSyncing(false);
          setTimeout(() => setSyncProgress(''), 10000);
          return;
        }

        if (totalCases > 0) {
          const percentComplete = totalCases > 0 ? Math.round((cardsCount / totalCases) * 100) : 0;

          // Get the account name being analyzed
          const { data: recentInputs } = await supabase
            .from('raw_inputs')
            .select('account_id, accounts(name)')
            .gte('created_at', recentTime)
            .limit(1);

          const accountName = (recentInputs?.[0]?.accounts as any)?.name || 'account';

          setSyncProgress(`Analyzing ${accountName}: ${cardsCount}/${totalCases} cases analyzed (${percentComplete}%) • ${accountsAnalyzed} accounts complete`);

          // Check if card count is stable (not increasing)
          if (cardsCount === previousCardCount) {
            stableCount++;
          } else {
            stableCount = 0;
          }
          previousCardCount = cardsCount;

          // Consider complete if: card count stable for 3 polls OR we have snapshots
          if (stableCount >= 3 || (accountsAnalyzed > 0 && cardsCount > 20)) {
            setSyncProgress('Refreshing dashboard...');
            await loadDashboard();

            // Calculate newly analyzed accounts in this sync
            const newlyAnalyzed = accountsAnalyzed - initialSnapshotCount;
            const remaining = totalPortfolioAccounts - accountsAnalyzed;

            if (remaining > 0) {
              const analyzedText = newlyAnalyzed > 0
                ? `✓ ${newlyAnalyzed} account${newlyAnalyzed > 1 ? 's' : ''} analyzed!`
                : `✓ Sync complete!`;
              setSyncProgress(`${analyzedText} ${remaining} accounts still need analysis.`);
            } else {
              setSyncProgress(`✓ All ${totalPortfolioAccounts} accounts are up to date!`);
            }

            setSyncing(false);
            setTimeout(() => setSyncProgress(''), 10000); // Clear after 10 seconds
            return;
          }
        } else if (attempts > 5) {
          // After 10 seconds of polling with no cases, check if snapshots were created
          setSyncProgress('Refreshing dashboard...');

          // Get fresh snapshot count directly from database
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: portfolios } = await supabase
            .from('portfolios')
            .select('account_ids')
            .eq('user_id', user.id)
            .in('portfolio_type', ['top_25_edge', 'top_25_sitelink']);

          if (portfolios && portfolios.length > 0) {
            // Combine account IDs from all portfolios
            const allAccountIds = portfolios.flatMap(p => p.account_ids || []);
            const uniqueAccountIds = Array.from(new Set(allAccountIds));
            const today = new Date().toISOString().split('T')[0];
            const { data: todaySnapshots } = await supabase
              .from('account_snapshots')
              .select('account_id')
              .in('account_id', uniqueAccountIds)
              .eq('snapshot_date', today);

            const newSnapshotCount = todaySnapshots?.length || 0;
            const accountsAnalyzedThisRun = newSnapshotCount - initialSnapshotCount;

            await loadDashboard();

            if (accountsAnalyzedThisRun > 0) {
              // Get the account name that was just analyzed
              const { data: latestSnapshot } = await supabase
                .from('account_snapshots')
                .select('account_id, accounts(name)')
                .eq('snapshot_date', today)
                .in('account_id', uniqueAccountIds)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

              const accountName = (latestSnapshot?.accounts as any)?.name || 'Account';
              const remaining = totalPortfolioAccounts - newSnapshotCount;
              setSyncProgress(`✓ ${accountName} analyzed (0 cases found). ${remaining} accounts still need analysis.`);
            } else {
              setSyncProgress('✓ No new cases to sync. Already up to date!');
            }
          }

          setSyncing(false);
          setTimeout(() => setSyncProgress(''), 10000);
          return;
        }

        attempts++;
        setTimeout(pollProgress, 2000); // Check every 2 seconds
      };

      setTimeout(pollProgress, 2000); // Start polling after 2 seconds

    } catch (error) {
      console.error('Sync error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Provide helpful error messages based on common issues
      let userMessage = 'Failed to sync with Salesforce.\n\n';

      if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
        userMessage += '❌ Authentication Error: Your Salesforce connection may have expired.\n\nPlease go to Settings and reconnect to Salesforce.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        userMessage += '⏱️ Connection Timeout: The request took too long.\n\nThis can happen with large datasets. Please try again.';
      } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
        userMessage += '🌐 Network Error: Unable to reach Salesforce.\n\nPlease check your internet connection and try again.';
      } else if (errorMessage.includes('rate limit')) {
        userMessage += '⚠️ Rate Limit: Too many requests to Salesforce.\n\nPlease wait a few minutes and try again.';
      } else {
        userMessage += `Error: ${errorMessage}\n\nIf this persists, please check your Salesforce connection in Settings.`;
      }

      alert(userMessage);
      setSyncing(false);
      setSyncProgress('');
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
        case 'ofi':
          aVal = a.current_snapshot?.ofi_score || 0;
          bVal = b.current_snapshot?.ofi_score || 0;
          break;
        case 'case_volume':
          aVal = a.current_snapshot?.case_volume || 0;
          bVal = b.current_snapshot?.case_volume || 0;
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
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  // Determine primary software provider for an account
  const getPrimarySoftware = (account: AccountWithMetrics): 'EDGE' | 'SiteLink' | 'N/A' => {
    const vertical = account.vertical || '';

    const hasEDGE = vertical.includes('EDGE') || vertical.includes('Storable Edge');
    const hasSiteLink = vertical.includes('SiteLink');

    // If both are in the vertical string, prioritize EDGE (Storable's newer platform)
    if (hasEDGE && hasSiteLink) {
      return 'EDGE';
    }

    if (hasEDGE) return 'EDGE';
    if (hasSiteLink) return 'SiteLink';

    return 'N/A';
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
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('portfolios')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'portfolios'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Portfolios
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'favorites'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Favorites ({favorites.length})
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'reports'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Custom Reports
            </button>
            <button
              onClick={() => setActiveTab('themes')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'themes'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Key Friction Themes
            </button>
          </div>

          <div className="relative">
            <button
              onClick={syncSalesforce}
              disabled={syncing}
              onMouseEnter={() => setShowSyncTooltip(true)}
              onMouseLeave={() => setShowSyncTooltip(false)}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                syncing
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : totalPortfolioAccounts === 0
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : accountsAnalyzedToday < totalPortfolioAccounts
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {syncing && (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {syncing
                ? 'Syncing Portfolio...'
                : totalPortfolioAccounts === 0
                ? 'Sync from Salesforce'
                : accountsAnalyzedToday < totalPortfolioAccounts
                ? 'Sync & Analyze All'
                : 'All Up to Date ✓'}
            </button>
            {!syncing && accountsAnalyzedToday < totalPortfolioAccounts && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                {totalPortfolioAccounts - accountsAnalyzedToday}
              </span>
            )}

            {/* Sync Status Tooltip */}
            {showSyncTooltip && (analyzedAccountNames.length > 0 || pendingAccountNames.length > 0) && (
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
                  Click "Sync & Analyze All" to process all pending accounts. Runs automatically every night at 2am UTC.
                </div>
              </div>
            )}
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
                <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border-2 border-purple-200 p-8 text-center">
                  <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-full mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Friction Intelligence!</h2>
                    <p className="text-gray-600 mb-6">Let's get started by syncing your Salesforce accounts</p>
                  </div>

                  <div className="bg-white rounded-lg p-6 mb-6 text-left">
                    <h3 className="font-semibold text-gray-900 mb-4">What happens when you sync:</h3>
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-semibold">1</span>
                        <span className="text-gray-700">Import your Top 25 accounts from Salesforce (EDGE & SiteLink)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-semibold">2</span>
                        <span className="text-gray-700">Load support cases from the last 90 days</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-semibold">3</span>
                        <span className="text-gray-700">Analyze up to 3 accounts with AI to identify friction patterns</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-semibold">4</span>
                        <span className="text-gray-700">Calculate Operational Friction Index (OFI) scores</span>
                      </li>
                    </ol>
                  </div>

                  <button
                    onClick={syncSalesforce}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all"
                  >
                    {syncing ? (
                      <>
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Syncing from Salesforce...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Sync from Salesforce
                      </>
                    )}
                  </button>

                  <p className="text-sm text-gray-500 mt-4">Takes 2-5 minutes • You can continue working while it syncs</p>
                </div>
              </div>
            )}

            {top25.length > 0 && (
              <PortfolioSummary
                top25={filterAccountsBySoftware(top25)}
                singleOperator={[]}
              />
            )}

            <section className="mt-12">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Software Accounts (EDGE & SiteLink)</h2>
                <div className="flex items-center gap-2">
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
                  <span className="text-sm text-gray-600">
                    Showing {filterAccountsBySoftware(top25).length} of {top25.length} accounts
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th onClick={() => handleSort('name')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                        Account {getSortIcon('name')}
                      </th>
                      <th onClick={() => handleSort('arr')} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                        ARR {getSortIcon('arr')}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Software</th>
                      <th onClick={() => handleSort('ofi')} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                        OFI Score {getSortIcon('ofi')}
                      </th>
                      <th onClick={() => handleSort('case_volume')} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                        Cases (90d) {getSortIcon('case_volume')}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Analyzed</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortAccounts(filterAccountsBySoftware(top25)).map((account) => (
                      <tr
                        key={account.id}
                        onClick={() => router.push(`/account/${account.id}`)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{account.name}</div>
                          <div className="text-xs text-gray-500">{account.segment}</div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          ${Math.round(account.arr || 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-900">
                          {getPrimarySoftware(account)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
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
                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                          {account.current_snapshot?.case_volume !== undefined ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-900 font-medium">{account.current_snapshot.case_volume}</span>
                              {portfolioCaseVolumeAvg > 0 && (
                                <span className={`text-xs ${
                                  account.current_snapshot.case_volume > portfolioCaseVolumeAvg * 1.5
                                    ? 'text-red-600 font-medium'
                                    : account.current_snapshot.case_volume < portfolioCaseVolumeAvg * 0.5
                                    ? 'text-yellow-600'
                                    : 'text-gray-500'
                                }`}>
                                  {account.current_snapshot.case_volume > portfolioCaseVolumeAvg * 1.5
                                    ? '⚠️'
                                    : account.current_snapshot.case_volume < portfolioCaseVolumeAvg * 0.5
                                    ? '⬇️'
                                    : ''}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {getTrendIcon(account.current_snapshot?.trend_direction)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                          {account.current_snapshot?.created_at
                            ? new Date(account.current_snapshot.created_at).toLocaleDateString()
                            : 'Never'}
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
          <CustomReports
            allAccounts={top25}
          />
        )}

        {activeTab === 'themes' && (
          <ThemesTab
            accounts={top25}
          />
        )}
      </main>
    </div>
  );
}
