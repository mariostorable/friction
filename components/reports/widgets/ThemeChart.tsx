'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ThemeData } from '@/lib/reports/reportTypes';
import { getSeverityColor } from '@/lib/reports/reportCalculations';

interface ThemeChartProps {
  data: ThemeData[];
  maxBars?: number;
  showSeverity?: boolean;
  onClick?: (theme: string) => void;
  title?: string;
}

export default function ThemeChart({
  data,
  maxBars = 10,
  showSeverity = true,
  onClick,
  title = 'Top Friction Themes'
}: ThemeChartProps) {
  // Limit to top N bars
  const chartData = data.slice(0, maxBars).map(theme => ({
    name: theme.display_name,
    count: theme.count,
    severity: theme.avgSeverity,
    theme_key: theme.theme_key
  }));

  // Get color based on severity
  const getBarColor = (severity: number) => {
    if (severity >= 4) return '#dc2626'; // red-600
    if (severity >= 3) return '#f97316'; // orange-600
    if (severity >= 2) return '#eab308'; // yellow-600
    return '#6b7280'; // gray-600
  };

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-sm text-gray-600">No friction themes found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {showSeverity && (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-gray-600 rounded"></span>
              <span className="text-gray-600">Low (1-2)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-yellow-600 rounded"></span>
              <span className="text-gray-600">Medium (2-3)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-orange-600 rounded"></span>
              <span className="text-gray-600">High (3-4)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-red-600 rounded"></span>
              <span className="text-gray-600">Critical (4-5)</span>
            </span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 40)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" stroke="#6b7280" />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#6b7280"
            width={110}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;

              const data = payload[0].payload;
              return (
                <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3">
                  <p className="font-semibold text-gray-900 mb-1">{data.name}</p>
                  <p className="text-sm text-gray-600">Count: {data.count}</p>
                  {showSeverity && (
                    <p className="text-sm text-gray-600">
                      Avg Severity: {data.severity.toFixed(1)}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar
            dataKey="count"
            cursor={onClick ? 'pointer' : 'default'}
            onClick={onClick ? (data) => onClick(data.theme_key) : undefined}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={showSeverity ? getBarColor(entry.severity) : '#2563eb'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {onClick && (
        <p className="text-xs text-gray-500 mt-2 text-center">Click a bar to drill down</p>
      )}
    </div>
  );
}
