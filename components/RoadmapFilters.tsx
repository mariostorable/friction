'use client';

import AccountMultiSelect from './AccountMultiSelect';

interface RoadmapFiltersProps {
  accounts: Array<{ id: string; name: string; products: string }>;
  selectedAccountIds: string[];
  portfolioFilter: 'all' | 'top_25_edge' | 'top_25_sitelink' | 'top_25_marine';
  productFilter: 'all' | 'edge' | 'sitelink' | 'other';
  statusFilter: 'all' | 'resolved' | 'closed';
  dateRangeDays: number;
  onAccountsChange: (ids: string[]) => void;
  onPortfolioChange: (portfolio: 'all' | 'top_25_edge' | 'top_25_sitelink' | 'top_25_marine') => void;
  onProductChange: (product: 'all' | 'edge' | 'sitelink' | 'other') => void;
  onStatusChange: (status: 'all' | 'resolved' | 'closed') => void;
  onDateRangeChange: (days: number) => void;
}

export default function RoadmapFilters({
  accounts,
  selectedAccountIds,
  portfolioFilter,
  productFilter,
  statusFilter,
  dateRangeDays,
  onAccountsChange,
  onPortfolioChange,
  onProductChange,
  onStatusChange,
  onDateRangeChange
}: RoadmapFiltersProps) {

  const getPortfolioButtonClass = (value: string) => {
    const isActive = portfolioFilter === value;
    return `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
      isActive
        ? 'bg-purple-600 text-white'
        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
    }`;
  };

  const getDateRangeButtonClass = (days: number) => {
    const isActive = dateRangeDays === days;
    return `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
      isActive
        ? 'bg-purple-600 text-white'
        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
    }`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-4">
      {/* Portfolio Quick Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm font-medium text-gray-700 min-w-max">Portfolio:</label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onPortfolioChange('all')}
            className={getPortfolioButtonClass('all')}
          >
            All
          </button>
          <button
            onClick={() => onPortfolioChange('top_25_edge')}
            className={getPortfolioButtonClass('top_25_edge')}
          >
            Top 25 EDGE
          </button>
          <button
            onClick={() => onPortfolioChange('top_25_sitelink')}
            className={getPortfolioButtonClass('top_25_sitelink')}
          >
            Top 25 SiteLink
          </button>
          <button
            onClick={() => onPortfolioChange('top_25_marine')}
            className={getPortfolioButtonClass('top_25_marine')}
          >
            Top 25 Marine
          </button>
        </div>
      </div>

      {/* Account Multi-Select and Product Filter */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 min-w-max">Accounts:</label>
          <AccountMultiSelect
            accounts={accounts}
            selectedIds={selectedAccountIds}
            onChange={onAccountsChange}
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="product-filter" className="text-sm font-medium text-gray-700 min-w-max">
            Product:
          </label>
          <select
            id="product-filter"
            value={productFilter}
            onChange={(e) => onProductChange(e.target.value as 'all' | 'edge' | 'sitelink' | 'other')}
            className="block px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
          >
            <option value="all">All Products</option>
            <option value="edge">EDGE</option>
            <option value="sitelink">SiteLink</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium text-gray-700 min-w-max">
            Status:
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as 'all' | 'resolved' | 'closed')}
            className="block px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm font-medium text-gray-700 min-w-max">Resolved in last:</label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onDateRangeChange(1)}
            className={getDateRangeButtonClass(1)}
          >
            1 day
          </button>
          <button
            onClick={() => onDateRangeChange(7)}
            className={getDateRangeButtonClass(7)}
          >
            7 days
          </button>
          <button
            onClick={() => onDateRangeChange(30)}
            className={getDateRangeButtonClass(30)}
          >
            30 days
          </button>
          <button
            onClick={() => onDateRangeChange(90)}
            className={getDateRangeButtonClass(90)}
          >
            90 days
          </button>
        </div>
      </div>
    </div>
  );
}
