'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface AccountMultiSelectProps {
  accounts: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function AccountMultiSelect({ accounts, selectedIds, onChange }: AccountMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const filteredAccounts = accounts.filter(acc =>
    acc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleAccount = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    onChange(accounts.map(a => a.id));
  };

  const clearAll = () => {
    onChange([]);
  };

  const getButtonLabel = () => {
    if (selectedIds.length === 0) {
      return 'All Accounts';
    }
    if (selectedIds.length === 1) {
      const account = accounts.find(a => a.id === selectedIds[0]);
      return account?.name || '1 selected';
    }
    return `${selectedIds.length} selected`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 transition-colors"
      >
        <span className="truncate max-w-xs">{getButtonLabel()}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-hidden">
          {/* Search and controls */}
          <div className="sticky top-0 bg-white p-3 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              autoFocus
            />
            <div className="flex gap-3 mt-2">
              <button
                onClick={selectAll}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                Select All
              </button>
              <button
                onClick={clearAll}
                className="text-xs text-gray-600 hover:text-gray-800 font-medium"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Account list */}
          <div className="overflow-y-auto max-h-80">
            {filteredAccounts.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No accounts found
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredAccounts.map(account => (
                  <label
                    key={account.id}
                    className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(account.id)}
                      onChange={() => toggleAccount(account.id)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-900 flex-1 truncate">{account.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
