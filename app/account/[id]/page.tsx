'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Account, AccountSnapshot, FrictionCard, Theme } from '@/types';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Share2,
  Download,
  ExternalLink,
  Info,
  AlertCircle,
  ArrowLeft,
  X
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import VisitBriefing from '@/components/VisitBriefing';
import CaseVolumeCard from '@/components/CaseVolumeCard';
import CaseOriginsAlert from '@/components/CaseOriginsAlert';
import PeerCaseComparison from '@/components/PeerCaseComparison';
import FrictionClusters from '@/components/FrictionClusters';
import AnalysisResultModal from '@/components/AnalysisResultModal';

export default function AccountDetailPage() {
  const params = useParams();
  const accountId = params.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const themeFilter = searchParams.get('theme');

  const [account, setAccount] = useState<Account | null>(null);
  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>([]);
  const [frictionCards, setFrictionCards] = useState<FrictionCard[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showScoreExplanation, setShowScoreExplanation] = useState(false);
  const [caseVolumeMetrics, setCaseVolumeMetrics] = useState({
    current: 0,
    accountAvg: 0,
    portfolioAvg: 0,
    last7Days: 0
  });
  const [caseOrigins, setCaseOrigins] = useState<any[]>([]);
  const [peerAccounts, setPeerAccounts] = useState<any[]>([]);
  const [analysisResult, setAnalysisResult] = useState<{
    synced: number;
    analyzed: number;
    ofiScore: number;
    highSeverity: number;
    remaining?: number;
  } | null>(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    loadAccountData();
  }, [accountId]);

  async function loadAccountData() {
    try {
      setLoading(true);

      // Get current user first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user');
        return;
      }

      // Load account
      const { data: accountData } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .single();

      if (accountData) setAccount(accountData);

      // Load snapshots (last 90 days)
      const { data: snapshotsData } = await supabase
        .from('account_snapshots')
        .select('*')
        .eq('account_id', accountId)
        .gte('snapshot_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .order('snapshot_date', { ascending: true });

      if (snapshotsData) setSnapshots(snapshotsData);

      // Load ALL friction cards (no date filter for debugging)
      const { data: cardsData, error: cardsError } = await supabase
        .from('friction_cards')
        .select(`
          *,
          raw_input:raw_inputs(source_url, metadata, created_at)
        `)
        .eq('account_id', accountId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      console.log('Friction cards query params:', {
        account_id: accountId,
        user_id: user.id,
        note: 'Loading ALL friction cards (no date filter)'
      });

      if (cardsError) {
        console.error('Error loading friction cards:', cardsError);
        console.error('Full error details:', JSON.stringify(cardsError, null, 2));
      }
      if (cardsData) {
        console.log(`Loaded ${cardsData.length} friction cards for account`);
        if (cardsData.length > 0) {
          console.log('Sample friction card:', cardsData[0]);
        }
        setFrictionCards(cardsData);
      } else {
        console.log('No friction cards data returned (cardsData is null/undefined)');
      }

      // Load themes
      const { data: themesData } = await supabase
        .from('themes')
        .select('*')
        .eq('is_active', true);

      if (themesData) setThemes(themesData);

      // Calculate case volume metrics
      if (snapshotsData && snapshotsData.length > 0) {
        // Current volume (latest snapshot)
        const latestSnapshot = snapshotsData[snapshotsData.length - 1];
        const currentVolume = latestSnapshot.case_volume || 0;

        // Account's historical average
        const avgVolume = snapshotsData.reduce((sum, s) => sum + (s.case_volume || 0), 0) / snapshotsData.length;

        // Get portfolio average (all Top 25 accounts)
        if (user) {
          // Get both EDGE and SiteLink portfolios
          const { data: portfolios } = await supabase
            .from('portfolios')
            .select('account_ids')
            .eq('user_id', user.id)
            .in('portfolio_type', ['top_25_edge', 'top_25_sitelink']);

          if (portfolios && portfolios.length > 0) {
            // Combine account IDs from both portfolios
            const allAccountIds = portfolios.flatMap(p => p.account_ids || []);
            const portfolio = { account_ids: Array.from(new Set(allAccountIds)) };
            // Get recent snapshots for all Top 25 accounts
            const { data: portfolioSnapshots } = await supabase
              .from('account_snapshots')
              .select('case_volume')
              .in('account_id', portfolio.account_ids)
              .gte('snapshot_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

            const portfolioAvg = portfolioSnapshots && portfolioSnapshots.length > 0
              ? portfolioSnapshots.reduce((sum, s) => sum + (s.case_volume || 0), 0) / portfolioSnapshots.length
              : 0;

            // Get all cases and filter by Salesforce creation date (last 7 days)
            const { data: allCases } = await supabase
              .from('raw_inputs')
              .select('id, metadata, source_url, created_at')
              .eq('account_id', accountId)
              .eq('user_id', user.id)
              .order('created_at', { ascending: false });

            // Filter by actual Salesforce case creation date, not DB sync date
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const recentCases = allCases?.filter(caseItem => {
              const sfCreatedDate = caseItem.metadata?.created_date;
              if (!sfCreatedDate) return false;
              const caseDate = new Date(sfCreatedDate);
              return caseDate >= sevenDaysAgo;
            }) || [];

            const last7DaysCount = recentCases.length;

            // Group cases by origin for smart alerts
            const originGroups: Record<string, any[]> = {};
            recentCases.forEach(caseItem => {
              // Try multiple possible field names from Salesforce (check all common variations)
              let origin = caseItem.metadata?.Origin ||
                          caseItem.metadata?.SuppliedChannel ||
                          caseItem.metadata?.origin ||
                          caseItem.metadata?.supplied_channel ||
                          caseItem.metadata?.CaseOrigin ||
                          caseItem.metadata?.['Case Origin'] ||
                          caseItem.metadata?.Channel ||
                          caseItem.metadata?.channel ||
                          caseItem.metadata?.Source ||
                          caseItem.metadata?.source;

              // If still not found, search for any field containing "origin" or "channel" in the name
              if (!origin || origin === '') {
                const metadata = caseItem.metadata || {};
                for (const key in metadata) {
                  const lowerKey = key.toLowerCase();
                  if ((lowerKey.includes('origin') || lowerKey.includes('channel') || lowerKey.includes('source'))
                      && metadata[key]
                      && typeof metadata[key] === 'string') {
                    origin = metadata[key];
                    break;
                  }
                }
              }

              // Default to Unknown if still not found
              if (!origin || origin === '') {
                origin = 'Unknown';
              }

              if (!originGroups[origin]) {
                originGroups[origin] = [];
              }
              originGroups[origin].push(caseItem);
            });

            // Convert to array and sort by count
            const originData = Object.entries(originGroups).map(([origin, cases]) => ({
              origin,
              count: cases.length,
              percentage: ((cases.length / last7DaysCount) * 100).toFixed(1),
              cases: cases, // Pass all cases so they can be expanded
              priority: cases.filter(c => c.metadata?.priority === 'High').length
            })).sort((a, b) => b.count - a.count);

            setCaseOrigins(originData);

            setCaseVolumeMetrics({
              current: currentVolume,
              accountAvg: avgVolume,
              portfolioAvg,
              last7Days: last7DaysCount
            });

            // Fetch peer accounts for comparison (all Top 25 accounts with their case volumes)
            const { data: peerAccountsData } = await supabase
              .from('accounts')
              .select(`
                id,
                name,
                vertical,
                current_snapshot:account_snapshots!account_snapshots_account_id_fkey(
                  case_volume,
                  created_at
                )
              `)
              .in('id', portfolio.account_ids);

            if (peerAccountsData) {
              // Extract latest snapshot for each peer and extract product type
              const peers = peerAccountsData
                .map(peer => {
                  const latestSnapshot = Array.isArray(peer.current_snapshot)
                    ? peer.current_snapshot.sort((a: any, b: any) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                      )[0]
                    : peer.current_snapshot;

                  // Extract product from vertical (e.g., "Software (EDGE)" -> "EDGE")
                  let product = 'Other';
                  if (peer.vertical?.includes('EDGE')) {
                    product = 'EDGE';
                  } else if (peer.vertical?.includes('SiteLink')) {
                    product = 'SiteLink';
                  }

                  return {
                    id: peer.id,
                    name: peer.name,
                    caseVolume: latestSnapshot?.case_volume || 0,
                    product
                  };
                })
                .filter(p => p.caseVolume > 0); // Only include accounts with case data

              setPeerAccounts(peers);
            }
          }
        }
      }

    } catch (error) {
      console.error('Error loading account data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createShareLink() {
    try {
      // Generate shareable link
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const { data, error } = await supabase
        .from('shared_links')
        .insert({
          account_id: accountId,
          token,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      const shareUrl = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(shareUrl);
      
      alert('Share link copied to clipboard! Valid for 7 days.');
    } catch (error) {
      console.error('Error creating share link:', error);
      alert('Failed to create share link');
    }
  }

  function getSalesforceUrl() {
    if (!account?.salesforce_id) return null;
    return `https://storable.my.salesforce.com/${account.salesforce_id}`;
  }

  function exportToCSV() {
    if (!account) return;

    // Prepare CSV data
    const rows = [];

    // Header row
    rows.push(['Friction Intelligence Export']);
    rows.push(['Account:', account.name]);
    rows.push(['ARR:', `$${account.arr?.toLocaleString() || 'N/A'}`]);
    rows.push(['Products:', account.products || 'N/A']);
    rows.push(['Business Unit:', account.vertical || 'N/A']);
    rows.push(['Segment:', account.segment || 'N/A']);
    rows.push(['Customer Since:', account.customer_since ? new Date(account.customer_since).getFullYear() : 'N/A']);
    rows.push(['']);

    // OFI Score
    const latestSnapshot = snapshots[snapshots.length - 1];
    if (latestSnapshot) {
      rows.push(['OFI Score:', latestSnapshot.ofi_score]);
      rows.push(['Trend:', latestSnapshot.trend_direction]);
      rows.push(['High Severity Issues:', latestSnapshot.high_severity_count]);
      rows.push(['Total Friction Cards:', latestSnapshot.friction_card_count]);
    }
    rows.push(['']);

    // Case Volume
    if (caseVolumeMetrics.current > 0) {
      rows.push(['Case Volume Analysis']);
      rows.push(['90-Day Total:', caseVolumeMetrics.current]);
      rows.push(['Weekly Average:', (caseVolumeMetrics.accountAvg / 13).toFixed(1)]);
      rows.push(['Last 7 Days:', caseVolumeMetrics.last7Days]);
    }
    rows.push(['']);

    // Friction Cards
    rows.push(['Friction Cards']);
    rows.push(['Theme', 'Summary', 'Severity', 'Sentiment', 'Root Cause', 'Created Date']);

    frictionCards.forEach(card => {
      const theme = themes.find(t => t.theme_key === card.theme_key);
      rows.push([
        theme?.label || card.theme_key,
        card.summary,
        card.severity.toString(),
        card.sentiment,
        card.root_cause_hypothesis,
        new Date(card.created_at).toLocaleDateString()
      ]);
    });

    // Convert to CSV string
    const csvContent = rows.map(row =>
      row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${account.name.replace(/[^a-z0-9]/gi, '_')}_friction_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function analyzeFriction() {
    if (!confirm('This will:\n1. Sync Salesforce Cases (last 90 days)\n2. Analyze unprocessed cases with Claude (processes in batches)\n3. Calculate OFI score\n\nFor accounts with many cases, you may need to click Analyze multiple times. Continue?')) {
      return;
    }

    setAnalyzing(true);
    try {
      // Step 1: Sync Cases
      console.log('Step 1: Syncing cases...');
      const casesResponse = await fetch('/api/salesforce/sync-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      console.log('Sync cases response status:', casesResponse.status);
      const casesResponseText = await casesResponse.text();
      console.log('Sync cases response (first 500 chars):', casesResponseText.substring(0, 500));

      let casesResult;
      try {
        casesResult = JSON.parse(casesResponseText);
      } catch (jsonError) {
        console.error('Failed to parse sync cases response:', jsonError);
        throw new Error(`STEP 1 FAILED - Sync Cases API returned invalid JSON. Status: ${casesResponse.status}. Response: ${casesResponseText.substring(0, 300)}`);
      }

      if (!casesResponse.ok) {
        throw new Error(`STEP 1 FAILED - ${casesResult.error || 'Failed to sync cases'}`);
      }

      console.log('Step 1 complete:', casesResult);

      // Step 2: Analyze with Claude
      console.log('Step 2: Analyzing friction...');
      const analyzeResponse = await fetch('/api/analyze-friction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      console.log('Analyze friction response status:', analyzeResponse.status);
      const analyzeResponseText = await analyzeResponse.text();
      console.log('Analyze friction response (first 500 chars):', analyzeResponseText.substring(0, 500));

      let analyzeResult;
      try {
        analyzeResult = JSON.parse(analyzeResponseText);
      } catch (jsonError) {
        console.error('Failed to parse analyze friction response:', jsonError);
        throw new Error(`STEP 2 FAILED - Analyze Friction API returned invalid JSON. Status: ${analyzeResponse.status}. Response: ${analyzeResponseText.substring(0, 300)}`);
      }

      if (!analyzeResponse.ok) {
        throw new Error(`STEP 2 FAILED - ${analyzeResult.error || 'Failed to analyze friction'}`);
      }

      console.log('Step 2 complete:', analyzeResult);

      // Step 3: Calculate OFI
      console.log('Step 3: Calculating OFI...');
      const ofiResponse = await fetch('/api/calculate-ofi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      console.log('Calculate OFI response status:', ofiResponse.status);
      const ofiResponseText = await ofiResponse.text();
      console.log('Calculate OFI response (first 500 chars):', ofiResponseText.substring(0, 500));

      let ofiResult;
      try {
        ofiResult = JSON.parse(ofiResponseText);
      } catch (jsonError) {
        console.error('Failed to parse OFI response:', jsonError);
        throw new Error(`STEP 3 FAILED - Calculate OFI API returned invalid JSON. Status: ${ofiResponse.status}. Response: ${ofiResponseText.substring(0, 300)}`);
      }

      if (!ofiResponse.ok) {
        throw new Error(`STEP 3 FAILED - ${ofiResult.error || 'Failed to calculate OFI'}`);
      }

      console.log('Step 3 complete:', ofiResult);

      // Show modal instead of alert
      setAnalysisResult({
        synced: casesResult.synced,
        analyzed: analyzeResult.analyzed,
        ofiScore: ofiResult.ofi_score,
        highSeverity: ofiResult.high_severity,
        remaining: analyzeResult.remaining
      });

    } catch (error) {
      console.error('Analysis error:', error);
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error);
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      alert(`❌ Analysis failed: ${errorMessage}`);
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading account details...</p>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600">Account not found</p>
        </div>
      </div>
    );
  }

  const latestSnapshot = snapshots[snapshots.length - 1];
  const ofiScore = latestSnapshot?.ofi_score || 0;
  const trend = latestSnapshot?.trend_vs_prior_period || 0;

  // Prepare chart data
  const chartData = snapshots.map(s => ({
    date: new Date(s.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    ofi: s.ofi_score,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Navigation Breadcrumb */}
          <div className="flex items-center gap-2 text-sm mb-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Dashboard
            </button>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600">{account.name}</span>
          </div>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">{account.name}</h1>
                {getSalesforceUrl() && (
                  <a
                    href={getSalesforceUrl()!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View in Salesforce
                  </a>
                )}
                {account.status !== 'active' && (
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
                    {account.status}
                  </span>
                )}
              </div>
              <div className="flex gap-4 mt-2 text-sm text-gray-600">
                <span className="font-medium">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(account.arr || 0)} ARR
                </span>
                <span>•</span>
                <span>{account.products?.toUpperCase() || 'N/A'}</span>
                <span>•</span>
                <span>{account.segment?.replace('_', ' ').toUpperCase() || 'N/A'}</span>
                {account.customer_since && (
                  <>
                    <span>•</span>
                    <span>Customer since {new Date(account.customer_since).getFullYear()}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={analyzeFriction}
                disabled={analyzing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AlertCircle className="w-4 h-4" />
                {analyzing ? 'Analyzing...' : 'Analyze Friction'}
              </button>
              <VisitBriefing 
                account={account}
                frictionCards={frictionCards}
                snapshot={latestSnapshot}
              />
              <button
                onClick={createShareLink}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* OFI Score Card with Explanation */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">Operational Friction Index</h2>
                <button
                  onClick={() => setShowScoreExplanation(!showScoreExplanation)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <Info className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Last 14 days • Updated daily
              </p>
            </div>
            <div className="text-right">
              <div className="text-5xl font-bold text-gray-900">{ofiScore.toFixed(0)}</div>
              <div className={`flex items-center justify-end gap-1 mt-1 ${
                trend > 0 ? 'text-red-600' : trend < 0 ? 'text-green-600' : 'text-gray-600'
              }`}>
                {trend > 0 ? <TrendingUp className="w-5 h-5" /> : 
                 trend < 0 ? <TrendingDown className="w-5 h-5" /> :
                 <Minus className="w-5 h-5" />}
                <span className="text-lg font-medium">
                  {trend > 0 ? '+' : ''}{trend.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Explanation Panel */}
          {showScoreExplanation && latestSnapshot && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">How this score is calculated:</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Friction cards (last 14 days):</span>
                  <span className="font-medium text-gray-900">
                    {latestSnapshot.score_breakdown?.card_count || latestSnapshot.friction_card_count}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Severity-weighted score:</span>
                  <span className="font-medium text-gray-900">
                    {latestSnapshot.score_breakdown?.severity_weighted || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Base score (log scale):</span>
                  <span className="font-medium text-gray-900">
                    {latestSnapshot.score_breakdown?.base_score ? latestSnapshot.score_breakdown.base_score.toFixed(1) : '0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Friction density (% of cases):</span>
                  <span className="font-medium text-gray-900">
                    {latestSnapshot.score_breakdown?.friction_density ? latestSnapshot.score_breakdown.friction_density.toFixed(1) + '%' : '0%'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Density multiplier:</span>
                  <span className="font-medium text-gray-900">
                    {latestSnapshot.score_breakdown?.density_multiplier ? latestSnapshot.score_breakdown.density_multiplier.toFixed(2) + 'x' : '1.0x'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">High severity boost:</span>
                  <span className="font-medium text-gray-900">
                    +{latestSnapshot.score_breakdown?.high_severity_boost?.toFixed(1) || 0}
                  </span>
                </div>
                <div className="pt-2 mt-2 border-t border-gray-100 flex justify-between">
                  <span className="font-medium text-gray-900">Total OFI Score:</span>
                  <span className="font-bold text-gray-900">{ofiScore.toFixed(0)}</span>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500 space-y-1">
                <p><strong>Formula:</strong> (Base Score × Density Multiplier) + High Severity Boost</p>
                <p><strong>Severity weights:</strong> 1→1pt, 2→2pts, 3→3pts, 4→5pts, 5→8pts</p>
                <p><strong>Scores:</strong> 70+ = High Friction, 40-69 = Medium, 0-39 = Low</p>
              </div>
            </div>
          )}
        </div>

        {/* Case Volume Analysis */}
        {caseVolumeMetrics.current > 0 && (
          <div className="mb-6">
            <CaseVolumeCard
              currentVolume={caseVolumeMetrics.current}
              accountHistoricalAvg={caseVolumeMetrics.accountAvg}
              portfolioAvg={caseVolumeMetrics.portfolioAvg}
              last7Days={caseVolumeMetrics.last7Days}
              accountName={account?.name || ''}
              facilityCount={account?.facility_count || undefined}
            />
          </div>
        )}

        {/* Case Origins Alert */}
        {caseOrigins.length > 0 && (
          <CaseOriginsAlert
            origins={caseOrigins}
            accountName={account?.name || ''}
            totalCases={caseVolumeMetrics.last7Days}
          />
        )}

        {/* Peer Case Comparison */}
        {peerAccounts.length > 0 && account && caseVolumeMetrics.current > 0 && (
          <PeerCaseComparison
            currentAccount={{
              name: account.name,
              caseVolume: caseVolumeMetrics.current,
              product: account.products?.includes('EDGE') ? 'EDGE' :
                       account.products?.includes('SiteLink') ? 'SiteLink' : 'Other'
            }}
            peers={peerAccounts}
          />
        )}

        {/* Trend Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">90-Day Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#6b7280', fontSize: 12 }}
                stroke="#d1d5db"
              />
              <YAxis 
                tick={{ fill: '#6b7280', fontSize: 12 }}
                stroke="#d1d5db"
                domain={[0, 100]}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '8px 12px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="ofi" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                name="OFI Score"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Friction Signals with Smart Clustering */}
        {themeFilter && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Filtered by theme: {themeFilter.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </p>
                <p className="text-xs text-blue-700">
                  Showing {frictionCards.filter(card => card.theme_key === themeFilter).length} of {frictionCards.length} friction cards
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/account/${accountId}`)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-white rounded-lg hover:bg-blue-100 border border-blue-300"
            >
              <X className="w-4 h-4" />
              Clear Filter
            </button>
          </div>
        )}
        <FrictionClusters
          frictionCards={themeFilter ? frictionCards.filter(card => card.theme_key === themeFilter) : frictionCards}
          themes={themes}
        />
      </main>

      {/* Analysis Result Modal */}
      <AnalysisResultModal
        isOpen={analysisResult !== null}
        onClose={() => {
          setAnalysisResult(null);
          window.location.reload();
        }}
        accountName={account?.name || 'Unknown Account'}
        accountId={accountId}
        synced={analysisResult?.synced || 0}
        analyzed={analysisResult?.analyzed || 0}
        ofiScore={analysisResult?.ofiScore || 0}
        highSeverity={analysisResult?.highSeverity || 0}
        remaining={analysisResult?.remaining}
      />
    </div>
  );
}
