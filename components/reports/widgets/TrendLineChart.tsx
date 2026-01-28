'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface TrendDataPoint {
  date: string;
  value: number;
  label?: string;
}

interface TrendLineChartProps {
  data: TrendDataPoint[];
  title?: string;
  yAxisLabel?: string;
  color?: string;
  height?: number;
}

export default function TrendLineChart({
  data,
  title = 'Trend Over Time',
  yAxisLabel = 'OFI Score',
  color = '#2563eb',
  height = 300
}: TrendLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-sm text-gray-600">No trend data available.</p>
      </div>
    );
  }

  // Format data for chart
  const chartData = data.map(point => ({
    ...point,
    displayDate: new Date(point.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }));

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="displayDate"
            stroke="#6b7280"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke="#6b7280"
            tick={{ fontSize: 12 }}
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;

              const data = payload[0].payload;
              return (
                <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3">
                  <p className="font-semibold text-gray-900 mb-1">
                    {new Date(data.date).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                  <p className="text-sm text-gray-600">
                    {yAxisLabel}: {data.value.toFixed(1)}
                  </p>
                  {data.label && (
                    <p className="text-xs text-gray-500 mt-1">{data.label}</p>
                  )}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Show trend indicator */}
      {data.length >= 2 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {data[data.length - 1].value > data[0].value ? (
            <span className="text-red-600 flex items-center gap-1">
              <span>↑</span>
              <span>Trending Up</span>
              <span className="text-gray-600">
                (+{((data[data.length - 1].value - data[0].value) / data[0].value * 100).toFixed(1)}%)
              </span>
            </span>
          ) : data[data.length - 1].value < data[0].value ? (
            <span className="text-green-600 flex items-center gap-1">
              <span>↓</span>
              <span>Trending Down</span>
              <span className="text-gray-600">
                ({((data[data.length - 1].value - data[0].value) / data[0].value * 100).toFixed(1)}%)
              </span>
            </span>
          ) : (
            <span className="text-gray-600 flex items-center gap-1">
              <span>→</span>
              <span>Stable</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
