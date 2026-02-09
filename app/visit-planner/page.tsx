'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { MapPin, List as ListIcon, Search, Filter, AlertCircle, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamically import map to avoid SSR issues with Google Maps
const AccountMap = dynamic(() => import('@/components/AccountMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  ),
});

interface NearbyAccount {
  id: string;
  name: string;
  arr: number | null;
  vertical: string | null;
  products: string | null;
  latitude: number;
  longitude: number;
  distance_miles: number;
  ofi_score: number;
  priority_score: number;
  owner_name: string | null;
  property_address_city: string | null;
  property_address_state: string | null;
  salesforce_id: string;
}

export default function VisitPlannerPage() {
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'city' | 'account'>('city');
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');

  // Search state
  const [cityInput, setCityInput] = useState('');
  const [stateInput, setStateInput] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  // Filter state
  const [radiusMiles, setRadiusMiles] = useState(50);
  const [verticalFilter, setVerticalFilter] = useState<string>('all');
  const [minArr, setMinArr] = useState(0);
  const [minFriction, setMinFriction] = useState(0);

  // Results state
  const [accounts, setAccounts] = useState<NearbyAccount[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: 39.8283,
    lng: -98.5795,
  }); // US center
  const [sortBy, setSortBy] = useState<'priority' | 'distance' | 'revenue' | 'friction'>('priority');
  const [error, setError] = useState<string | null>(null);

  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/');
    } else {
      setLoading(false);
    }
  }

  async function handleCitySearch() {
    if (!cityInput.trim()) {
      setError('Please enter a city name');
      return;
    }

    setSearching(true);
    setError(null);

    try {
      // Geocode city
      const geocodeResponse = await fetch('/api/visit-planner/geocode-city', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: cityInput,
          state: stateInput,
          country: 'US',
        }),
      });

      if (!geocodeResponse.ok) {
        const errorData = await geocodeResponse.json();
        throw new Error(errorData.details || 'Failed to find location');
      }

      const geocodeData = await geocodeResponse.json();
      const { latitude, longitude } = geocodeData;

      setMapCenter({ lat: latitude, lng: longitude });

      // Find nearby accounts
      await searchNearbyAccounts(latitude, longitude);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function searchNearbyAccounts(lat: number, lng: number) {
    try {
      const nearbyResponse = await fetch('/api/visit-planner/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          center_lat: lat,
          center_lng: lng,
          radius_miles: radiusMiles,
          filters: {
            vertical: verticalFilter === 'all' ? null : verticalFilter,
            min_arr: minArr,
            min_friction: minFriction,
          },
        }),
      });

      if (!nearbyResponse.ok) {
        const errorData = await nearbyResponse.json().catch(() => ({}));
        const errorMsg = errorData.error || 'Failed to search accounts';
        const errorDetails = errorData.details ? ` - ${errorData.details}` : '';
        throw new Error(`${errorMsg}${errorDetails}`);
      }

      const nearbyData = await nearbyResponse.json();
      setAccounts(nearbyData.accounts || []);

      // Show message if no accounts found
      if (!nearbyData.accounts || nearbyData.accounts.length === 0) {
        setError(`No accounts found within ${radiusMiles} miles. Try increasing the search radius or checking that your accounts have address data synced from Salesforce.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
    }
  }

  const sortedAccounts = [...accounts].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        return b.priority_score - a.priority_score;
      case 'distance':
        return a.distance_miles - b.distance_miles;
      case 'revenue':
        return (b.arr || 0) - (a.arr || 0);
      case 'friction':
        return b.ofi_score - a.ofi_score;
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <MapPin className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Client Visit Planner</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-gray-300"
              >
                Dashboard
              </button>
              <button
                onClick={() => router.push('/settings')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-gray-300"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Mode Toggle */}
        <div className="mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setSearchMode('city')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                searchMode === 'city'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              I'm going to [City]
            </button>
            <button
              onClick={() => setSearchMode('account')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                searchMode === 'account'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              I'm already seeing [Account]
            </button>
          </div>
        </div>

        {/* Search Interface */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          {searchMode === 'city' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search by City
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="City (e.g., Austin)"
                  value={cityInput}
                  onChange={e => setCityInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCitySearch()}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <input
                  type="text"
                  placeholder="State (e.g., TX)"
                  value={stateInput}
                  onChange={e => setStateInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCitySearch()}
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  onClick={handleCitySearch}
                  disabled={searching}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {searching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Search
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search by Account
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Account name..."
                  value={accountQuery}
                  onChange={e => setAccountQuery(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-2">Coming soon: Search for accounts near a specific customer</p>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h3 className="font-medium text-gray-900">Filters</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Radius: {radiusMiles} miles
              </label>
              <input
                type="range"
                min="10"
                max="200"
                value={radiusMiles}
                onChange={e => setRadiusMiles(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vertical</label>
              <select
                value={verticalFilter}
                onChange={e => setVerticalFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All</option>
                <option value="storage">Storage</option>
                <option value="marine">Marine</option>
                <option value="rv">RV</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Min ARR: ${minArr.toLocaleString()}
              </label>
              <input
                type="range"
                min="0"
                max="1000000"
                step="50000"
                value={minArr}
                onChange={e => setMinArr(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Min Friction: {minFriction}
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={minFriction}
                onChange={e => setMinFriction(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Map/List Toggle */}
        {accounts.length > 0 && (
          <div className="mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('map')}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                  activeTab === 'map'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <MapPin className="w-4 h-4" />
                Map View
              </button>
              <button
                onClick={() => setActiveTab('list')}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                  activeTab === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <ListIcon className="w-4 h-4" />
                List View
              </button>
              <div className="ml-auto flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="priority">Priority</option>
                  <option value="distance">Distance</option>
                  <option value="revenue">Revenue</option>
                  <option value="friction">Friction</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {accounts.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No search performed yet</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter a city name above to find nearby accounts
            </p>
            <p className="text-xs text-gray-500">
              Tip: Try searching for "Austin, TX" or "Chicago, IL"
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {activeTab === 'map' ? (
                <AccountMap accounts={sortedAccounts} center={mapCenter} radiusMiles={radiusMiles} />
              ) : (
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="font-medium text-gray-900">
                      {sortedAccounts.length} accounts found
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {sortedAccounts.map(account => (
                      <div
                        key={account.id}
                        className="p-4 hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/account/${account.id}`)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{account.name}</h4>
                            <p className="text-sm text-gray-600">
                              {account.property_address_city}, {account.property_address_state} •{' '}
                              {account.distance_miles} mi away
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-blue-600">{account.priority_score}</p>
                            <p className="text-xs text-gray-500">Priority</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-sm">
                          <span className="text-gray-600">
                            ARR: ${((account.arr || 0) / 1000).toFixed(0)}K
                          </span>
                          <span className="text-gray-600">Friction: {account.ofi_score}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            account.ofi_score >= 70
                              ? 'bg-red-100 text-red-800'
                              : account.ofi_score >= 40
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {account.ofi_score >= 70 ? 'High' : account.ofi_score >= 40 ? 'Medium' : 'Low'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-4">
                <h3 className="font-medium text-gray-900 mb-4">Summary</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Total Accounts</p>
                    <p className="text-2xl font-bold text-gray-900">{accounts.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Avg Priority Score</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {Math.round(
                        accounts.reduce((sum, a) => sum + a.priority_score, 0) / accounts.length
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Within {radiusMiles} miles</p>
                    <p className="text-sm text-gray-500">
                      of {cityInput || 'selected location'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
