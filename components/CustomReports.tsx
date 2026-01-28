'use client';

import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
  ColumnFiltersState,
  SortingState,
} from '@tanstack/react-table';
import {
  Filter,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  X,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AccountRow {
  id: string;
  name: string;
  arr: number | null;
  vertical: string | null;
  segment: string | null;
  ofi_score: number | null;
  case_volume: number | null;
  trend_direction: string | null;
  last_analyzed: string | null;
  product: string;
}

interface CustomReportsProps {
  allAccounts: any[];
}

export default function CustomReports({ allAccounts }: CustomReportsProps) {
  const router = useRouter();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'ofi_score', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);

  // Transform accounts data for the table
  const data = useMemo<AccountRow[]>(() => {
    return allAccounts.map(account => {
      // Extract product from products field
      let product = 'Other';
      if (account.products?.includes('EDGE')) product = 'EDGE';
      else if (account.products?.includes('SiteLink')) product = 'SiteLink';

      return {
        id: account.id,
        name: account.name,
        arr: account.arr,
        vertical: account.vertical,
        products: account.products,
        segment: account.segment,
        ofi_score: account.current_snapshot?.ofi_score ?? null,
        case_volume: account.current_snapshot?.case_volume ?? null,
        trend_direction: account.current_snapshot?.trend_direction ?? null,
        last_analyzed: account.current_snapshot?.created_at ?? null,
        product,
      };
    });
  }, [allAccounts]);

  // Define columns
  const columns = useMemo<ColumnDef<AccountRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Account Name',
        cell: ({ row }) => (
          <button
            onClick={() => router.push(`/account/${row.original.id}`)}
            className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            {row.original.name}
          </button>
        ),
      },
      {
        accessorKey: 'arr',
        header: 'ARR',
        cell: ({ row }) => (
          <span>
            {row.original.arr ? `$${row.original.arr.toLocaleString()}` : '-'}
          </span>
        ),
        filterFn: 'inNumberRange',
      },
      {
        accessorKey: 'product',
        header: 'Product',
        filterFn: 'equalsString',
      },
      {
        accessorKey: 'segment',
        header: 'Segment',
        cell: ({ row }) => (
          <span className="capitalize">
            {row.original.segment?.replace('_', ' ') || '-'}
          </span>
        ),
        filterFn: 'equalsString',
      },
      {
        accessorKey: 'ofi_score',
        header: 'OFI Score',
        cell: ({ row }) => {
          const score = row.original.ofi_score;
          if (score === null) return <span className="text-gray-400">-</span>;

          const colorClass =
            score >= 70 ? 'bg-red-100 text-red-800' :
            score >= 40 ? 'bg-yellow-100 text-yellow-800' :
            'bg-green-100 text-green-800';

          return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
              {score}
            </span>
          );
        },
        filterFn: 'inNumberRange',
      },
      {
        accessorKey: 'case_volume',
        header: () => (
          <div
            className="relative"
            onMouseEnter={() => setHoveredColumn('case_volume')}
            onMouseLeave={() => setHoveredColumn(null)}
          >
            Cases (90d)
            {hoveredColumn === 'case_volume' && (
              <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 whitespace-normal font-normal">
                Total number of Salesforce cases for this account in the last 90 days
                <div className="absolute -top-1 left-6 w-2 h-2 bg-gray-900 transform rotate-45"></div>
              </div>
            )}
          </div>
        ),
        cell: ({ row }) => (
          <span>{row.original.case_volume ?? '-'}</span>
        ),
        filterFn: 'inNumberRange',
      },
      {
        accessorKey: 'trend_direction',
        header: 'Trend',
        cell: ({ row }) => {
          const trend = row.original.trend_direction;
          if (trend === 'worsening') return <TrendingUp className="w-4 h-4 text-red-500" />;
          if (trend === 'improving') return <TrendingDown className="w-4 h-4 text-green-500" />;
          return <Minus className="w-4 h-4 text-gray-400" />;
        },
        filterFn: 'equalsString',
      },
      {
        accessorKey: 'last_analyzed',
        header: 'Last Analyzed',
        cell: ({ row }) => (
          <span className="text-sm text-gray-600">
            {row.original.last_analyzed
              ? new Date(row.original.last_analyzed).toLocaleDateString()
              : 'Never'}
          </span>
        ),
      },
    ],
    [router]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      columnFilters,
      sorting,
      globalFilter,
    },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 25,
      },
    },
  });

  // Export to CSV
  const exportToCSV = () => {
    const rows = table.getFilteredRowModel().rows.map(row => row.original);

    const csvContent = [
      ['Account Name', 'ARR', 'Product', 'Segment', 'OFI Score', 'Cases (90d)', 'Trend', 'Last Analyzed'],
      ...rows.map(row => [
        row.name,
        row.arr || '',
        row.product,
        row.segment || '',
        row.ofi_score || '',
        row.case_volume || '',
        row.trend_direction || '',
        row.last_analyzed ? new Date(row.last_analyzed).toLocaleDateString() : '',
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `friction-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Get unique values for filters
  const uniqueProducts = useMemo(() =>
    Array.from(new Set(data.map(d => d.product))).sort(),
    [data]
  );

  const uniqueSegments = useMemo(() =>
    Array.from(new Set(data.map(d => d.segment).filter(Boolean))).sort(),
    [data]
  );

  const uniqueTrends = useMemo(() =>
    Array.from(new Set(data.map(d => d.trend_direction).filter(Boolean))).sort(),
    [data]
  );

  return (
    <div className="space-y-6">
      {/* Search and Export */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              placeholder="Search accounts..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Quick Filters */}
        <div className="mt-4 space-y-3">
          {/* Product Filter */}
          <div>
            <label className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1 block">
              Product
            </label>
            <div className="flex flex-wrap gap-2">
              {uniqueProducts.map(product => {
                const isActive = columnFilters.some(
                  f => f.id === 'product' && f.value === product
                );
                return (
                  <button
                    key={product}
                    onClick={() => {
                      if (isActive) {
                        setColumnFilters(prev => prev.filter(f => f.id !== 'product'));
                      } else {
                        setColumnFilters(prev => [...prev.filter(f => f.id !== 'product'), { id: 'product', value: product }]);
                      }
                    }}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                      isActive
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {product}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Segment Filter */}
          {uniqueSegments.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1 block">
                Segment
              </label>
              <div className="flex flex-wrap gap-2">
                {uniqueSegments.map(segment => {
                  const isActive = columnFilters.some(
                    f => f.id === 'segment' && f.value === segment
                  );
                  return (
                    <button
                      key={segment}
                      onClick={() => {
                        if (isActive) {
                          setColumnFilters(prev => prev.filter(f => f.id !== 'segment'));
                        } else {
                          setColumnFilters(prev => [...prev.filter(f => f.id !== 'segment'), { id: 'segment', value: segment }]);
                        }
                      }}
                      className={`px-3 py-1 text-sm rounded-full border transition-colors capitalize ${
                        isActive
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {segment?.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trend Filter */}
          {uniqueTrends.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1 block">
                Trend
              </label>
              <div className="flex flex-wrap gap-2">
                {uniqueTrends.map(trend => {
                  const isActive = columnFilters.some(
                    f => f.id === 'trend_direction' && f.value === trend
                  );
                  return (
                    <button
                      key={trend}
                      onClick={() => {
                        if (isActive) {
                          setColumnFilters(prev => prev.filter(f => f.id !== 'trend_direction'));
                        } else {
                          setColumnFilters(prev => [...prev.filter(f => f.id !== 'trend_direction'), { id: 'trend_direction', value: trend }]);
                        }
                      }}
                      className={`px-3 py-1 text-sm rounded-full border transition-colors capitalize ${
                        isActive
                          ? 'bg-green-100 border-green-300 text-green-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {trend}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clear All */}
          {(columnFilters.length > 0 || globalFilter) && (
            <button
              onClick={() => {
                setColumnFilters([]);
                setGlobalFilter('');
              }}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <X className="w-4 h-4" />
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Report Summary</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Accounts</p>
            <p className="text-3xl font-bold text-gray-900">
              {table.getFilteredRowModel().rows.length}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Avg OFI Score</p>
            <p className="text-3xl font-bold text-gray-900">
              {(() => {
                const rows = table.getFilteredRowModel().rows;
                const withScores = rows.filter(r => r.original.ofi_score !== null);
                if (withScores.length === 0) return '-';
                const avg = withScores.reduce((sum, r) => sum + (r.original.ofi_score || 0), 0) / withScores.length;
                return Math.round(avg);
              })()}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">High Friction</p>
            <p className="text-3xl font-bold text-red-600">
              {table.getFilteredRowModel().rows.filter(r => (r.original.ofi_score || 0) >= 70).length}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Worsening</p>
            <p className="text-3xl font-bold text-orange-600">
              {table.getFilteredRowModel().rows.filter(r => r.original.trend_direction === 'worsening').length}
            </p>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getIsSorted() === 'asc' && <ChevronUp className="w-4 h-4" />}
                        {header.column.getIsSorted() === 'desc' && <ChevronDown className="w-4 h-4" />}
                        {!header.column.getIsSorted() && <ChevronsUpDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t border-gray-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>
          <div className="text-sm text-gray-700">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            {' '}({table.getFilteredRowModel().rows.length} total accounts)
          </div>
        </div>
      </div>
    </div>
  );
}
