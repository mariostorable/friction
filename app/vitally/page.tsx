'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Activity } from 'lucide-react';
import VitallyFieldDiscovery from '@/components/VitallyFieldDiscovery';

interface VitallyAccount {
  id: string;
  vitally_account_id: string;
  account_id: string | null;
  salesforce_account_id: string | null;
  account_name: string;
  health_score: number | null;
  nps_score: number | null;
  status: string | null;
  mrr: number | null;
  last_activity_at: string | null;
  synced_at: string;
  traits: any;
  // Linked account info
  account?: {
    id: string;
    name: string;
    arr: number | null;
    segment: string | null;
  };
}

export default function VitallyPage() {
  const [accounts, setAccounts] = useState<VitallyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'health_score' | 'nps_score' | 'account_name' | 'mrr'>('health_score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isVitallyConnected, setIsVitallyConnected] = useState(false);

  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    loadVitallyData();
    checkVitallyConnection();
  }, []);

  async function checkVitallyConnection() {
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('integration_type', 'vitally')
      .eq('status', 'active')
      .single();

    setIsVitallyConnected(!!integration);
  }

  async function loadVitallyData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }

      // Load Vitally accounts with linked account data
      const { data: vitallyAccounts, error } = await supabase
        .from('vitally_accounts')
        .select(`
          *,
          account:accounts(id, name, arr, segment)
        `)
        .eq('user_id', user.id)
        .order('health_score', { ascending: true, nullsFirst: false });

      if (error) {
        console.error('Error loading Vitally data:', error);
      } else {
        setAccounts(vitallyAccounts || []);
      }
    } catch (error) {
      console.error('Error loading Vitally data:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'health_score' ? 'asc' : 'desc');
    }
  }

  const sortedAndFilteredAccounts = accounts
    .filter(acc => filterStatus === 'all' || acc.status === filterStatus)
    .sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'health_score':
          aVal = a.health_score ?? -1;
          bVal = b.health_score ?? -1;
          break;
        case 'nps_score':
          aVal = a.nps_score ?? -999;
          bVal = b.nps_score ?? -999;
          break;
        case 'account_name':
          aVal = a.account_name.toLowerCase();
          bVal = b.account_name.toLowerCase();
          break;
        case 'mrr':
          aVal = a.mrr ?? 0;
          bVal = b.mrr ?? 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const healthScoreColor = (score: number | null) => {
    if (score === null) return 'bg-gray-100 text-gray-800';
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const npsScoreColor = (score: number | null) => {
    if (score === null) return 'bg-gray-100 text-gray-800';
    if (score >= 50) return 'bg-green-100 text-green-800';
    if (score >= 0) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // Calculate summary stats
  const avgHealthScore = accounts.length > 0
    ? accounts.filter(a => a.health_score !== null).reduce((sum, a) => sum + (a.health_score || 0), 0) / accounts.filter(a => a.health_score !== null).length
    : 0;

  const atRiskCount = accounts.filter(a => a.health_score !== null && a.health_score < 60).length;
  const healthyCount = accounts.filter(a => a.health_score !== null && a.health_score >= 80).length;
  const linkedCount = accounts.filter(a => a.account_id !== null).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Vitally health data...</p>
        </div>
      </div>
    );
  }

  if (!isVitallyConnected) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Vitally Customer Health</h1>
                <p className="mt-1 text-sm text-gray-500">Monitor customer health scores and engagement metrics</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-8 text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
                  <Activity className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Vitally</h2>
                <p className="text-gray-600 mb-6">Get customer health insights by connecting your Vitally account</p>
              </div>

              <button
                onClick={() => router.push('/settings')}
                className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all"
              >
                Go to Settings to Connect Vitally
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Vitally Customer Health</h1>
                <p className="mt-1 text-sm text-gray-500">Monitor customer health scores and engagement metrics</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
            <Activity className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Vitally Accounts</h2>
            <p className="text-gray-600 mb-4">
              Sync your Vitally data to see customer health scores here.
            </p>
            <button
              onClick={() => router.push('/settings')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go to Settings to Sync
            </button>
          </div>
        </main>
      </div>
    );
  }

  const uniqueStatuses = Array.from(new Set(accounts.map(a => a.status).filter(Boolean)));

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
                <h1 className="text-3xl font-bold text-gray-900">Vitally Customer Health</h1>
                <p className="mt-1 text-sm text-gray-500">Monitor customer health scores and engagement metrics</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Accounts</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{accounts.length}</p>
              </div>
              <Activity className="w-8 h-8 text-blue-500" />
            </div>
            <p className="text-xs text-gray-500 mt-2">{linkedCount} linked to Salesforce</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Health Score</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{Math.round(avgHealthScore)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-xs text-gray-500 mt-2">Across all accounts</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Healthy Accounts</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{healthyCount}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-xs text-gray-500 mt-2">Health score ≥ 80</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">At Risk</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{atRiskCount}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-xs text-gray-500 mt-2">Health score &lt; 60</p>
          </div>
        </div>

        {/* Field Discovery */}
        <div className="mb-8">
          <VitallyFieldDiscovery />
        </div>

        {/* Filters */}
        <div className="mb-6 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter by status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <span className="text-sm text-gray-600">
            Showing {sortedAndFilteredAccounts.length} of {accounts.length} accounts
          </span>
        </div>

        {/* Accounts Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  onClick={() => handleSort('account_name')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Account Name {sortField === 'account_name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('health_score')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Health Score {sortField === 'health_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('nps_score')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  NPS {sortField === 'nps_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th
                  onClick={() => handleSort('mrr')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  MRR {sortField === 'mrr' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Activity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Linked Account
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedAndFilteredAccounts.map((account) => (
                <tr
                  key={account.id}
                  onClick={() => account.account_id && router.push(`/account/${account.account_id}`)}
                  className={`${account.account_id ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{account.account_name}</div>
                    <div className="text-xs text-gray-500">{account.salesforce_account_id || 'No SF ID'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {account.health_score !== null ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${healthScoreColor(account.health_score)}`}>
                        {Math.round(account.health_score)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {account.nps_score !== null ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${npsScoreColor(account.nps_score)}`}>
                        {Math.round(account.nps_score)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {account.status ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                        {account.status}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {account.mrr !== null ? `$${account.mrr.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {account.last_activity_at
                      ? new Date(account.last_activity_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {account.account_id ? (
                      <div>
                        <div className="text-sm text-green-600 font-medium">✓ Linked</div>
                        {account.account && (
                          <div className="text-xs text-gray-500">{account.account.segment || 'N/A'}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Not linked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
