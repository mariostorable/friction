'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Star, Search, X } from 'lucide-react';
import AccountCard from './AccountCard';

interface FavoritesTabProps {
  favorites: any[];
  onUpdate: () => void;
}

export default function FavoritesTab({ favorites, onUpdate }: FavoritesTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadAllAccounts();
  }, []);

  async function loadAllAccounts() {
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .order('arr', { ascending: false })
      .limit(200);
    setAllAccounts(accounts || []);
  }

  const filteredFavorites = useMemo(() => {
    if (!searchQuery) return favorites;
    const query = searchQuery.toLowerCase();
    return favorites.filter(fav => 
      fav.account.name.toLowerCase().includes(query)
    );
  }, [favorites, searchQuery]);

  function searchAccounts(query: string) {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    const favoriteIds = new Set(favorites.map(f => f.account_id));
    const filtered = allAccounts
      .filter(a => !favoriteIds.has(a.id) && a.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 20);
    setSearchResults(filtered);
  }

  async function addFavorite(accountId: string) {
    console.log('Adding favorite:', accountId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('favorites').insert({
        user_id: user.id,
        account_id: accountId,
      });

      setSearchQuery('');
      setShowSearch(false);
      setSearchResults([]);
      onUpdate();
    } catch (error) {
      console.error('Error adding favorite:', error);
    }
  }

  async function removeFavorite(favoriteId: string) {
    try {
      await supabase.from('favorites').delete().eq('id', favoriteId);
      onUpdate();
    } catch (error) {
      console.error('Error removing favorite:', error);
    }
  }

  const accountsToShow = searchQuery.length >= 2 
    ? searchResults 
    : allAccounts.filter(a => !favorites.some(f => f.account_id === a.id)).slice(0, 50);

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Favorites</h3>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Search className="w-4 h-4" />
            {showSearch ? 'Close' : 'Add Account'}
          </button>
        </div>

        {showSearch && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchAccounts(e.target.value);
                }}
                placeholder="Search accounts by name..."
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Results */}
            {accountsToShow.length > 0 && (
              <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                <p className="text-sm text-gray-600 mb-2">
                  {searchQuery.length >= 2 ? 'Search results:' : 'All accounts (top 50):'}
                </p>
                {accountsToShow.map(account => (
                  <button
                    key={account.id}
                    onClick={() => addFavorite(account.id)}
                    className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 hover:border-purple-500 hover:bg-purple-50 transition-all"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-gray-900">{account.name}</p>
                        <p className="text-sm text-gray-600">
                          ${Math.round((account.arr || 0) / 12).toLocaleString()}/mo
                          {account.vertical && ` • ${account.vertical}`}
                        </p>
                      </div>
                      <Star className="w-5 h-5 text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filter existing favorites */}
        {!showSearch && favorites.length > 5 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter your favorites..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        )}
      </div>

      {/* Favorites List */}
      {filteredFavorites.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">
            {searchQuery ? 'No favorites match your search' : 'No favorites yet. Click "Add Account" to get started!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredFavorites.map(fav => (
            <div key={fav.id} className="relative">
              <AccountCard account={fav.account} />
              <button
                onClick={() => removeFavorite(fav.id)}
                className="absolute top-2 right-2 px-3 py-1 bg-white text-red-600 text-sm font-medium rounded-lg border border-gray-200 shadow hover:bg-red-50 transition-colors"
                title="Remove from favorites"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
