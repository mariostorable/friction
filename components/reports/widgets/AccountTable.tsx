'use client';

import { useState } from 'react';
import { AccountWithMetrics } from '@/types';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { getOfiColor, formatCurrency, getTrendIcon } from '@/lib/reports/reportCalculations';
import * as Icons from 'lucide-react';
import Link from 'next/link';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (account: AccountWithMetrics) => React.ReactNode;
}

interface AccountTableProps {
  accounts: AccountWithMetrics[];
  columns?: Column[];
  maxRows?: number;
  showPagination?: boolean;
  onRowClick?: (account: AccountWithMetrics) => void;
  title?: string;
}

const defaultColumns: Column[] = [
  {
    key: 'name',
    label: 'Account Name',
    sortable: true,
    render: (account) => (
      <Link
        href={`/account/${account.id}`}
        className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
      >
        {account.name}
        <ExternalLink className="w-3 h-3" />
      </Link>
    )
  },
  {
    key: 'arr',
    label: 'ARR',
    sortable: true,
    render: (account) => (
      <span className="text-gray-900 font-medium">
        {account.arr ? formatCurrency(account.arr) : '-'}
      </span>
    )
  },
  {
    key: 'products',
    label: 'Product',
    sortable: false,
    render: (account) => (
      <span className="text-sm text-gray-600">{account.products || '-'}</span>
    )
  },
  {
    key: 'ofi_score',
    label: 'OFI Score',
    sortable: true,
    render: (account) => {
      const score = account.current_snapshot?.ofi_score || 0;
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getOfiColor(score)}`}>
          {score}
        </span>
      );
    }
  },
  {
    key: 'case_volume',
    label: 'Cases (365d)',
    sortable: true,
    render: (account) => (
      <span className="text-gray-900">{account.current_snapshot?.case_volume || 0}</span>
    )
  },
  {
    key: 'trend',
    label: 'Trend',
    sortable: false,
    render: (account) => {
      const trend = account.current_snapshot?.trend_direction;
      const iconName = getTrendIcon(trend);
      const TrendIcon = (Icons as any)[iconName];
      const colorClass = trend === 'worsening' ? 'text-red-600' :
                        trend === 'improving' ? 'text-green-600' :
                        'text-gray-600';

      return (
        <div className={`flex items-center ${colorClass}`}>
          <TrendIcon className="w-4 h-4" />
        </div>
      );
    }
  }
];

export default function AccountTable({
  accounts,
  columns = defaultColumns,
  maxRows,
  showPagination = false,
  onRowClick,
  title
}: AccountTableProps) {
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  const rowsPerPage = maxRows || 10;

  // Sort accounts
  let sortedAccounts = [...accounts];
  if (sortKey) {
    sortedAccounts.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortKey) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'arr':
          aVal = a.arr || 0;
          bVal = b.arr || 0;
          break;
        case 'ofi_score':
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

      if (typeof aVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  // Paginate
  const totalPages = Math.ceil(sortedAccounts.length / rowsPerPage);
  const startIdx = (currentPage - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const paginatedAccounts = showPagination
    ? sortedAccounts.slice(startIdx, endIdx)
    : maxRows
    ? sortedAccounts.slice(0, maxRows)
    : sortedAccounts;

  const handleSort = (key: string, sortable?: boolean) => {
    if (!sortable) return;

    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}
        <p className="text-sm text-gray-600">No accounts found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {title && (
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  onClick={() => handleSort(column.key, column.sortable)}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {column.sortable && sortKey === column.key && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedAccounts.map((account) => (
              <tr
                key={account.id}
                className={`${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={() => onRowClick?.(account)}
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm">
                    {column.render ? column.render(account) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPagination && totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {startIdx + 1} to {Math.min(endIdx, sortedAccounts.length)} of {sortedAccounts.length} accounts
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {maxRows && !showPagination && sortedAccounts.length > maxRows && (
        <div className="px-6 py-3 border-t border-gray-200 text-sm text-gray-600 text-center">
          Showing first {maxRows} of {sortedAccounts.length} accounts
        </div>
      )}
    </div>
  );
}
