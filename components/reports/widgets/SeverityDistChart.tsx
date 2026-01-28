'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface SeverityData {
  severity: number;
  count: number;
}

interface SeverityDistChartProps {
  data: SeverityData[];
  title?: string;
  height?: number;
}

const SEVERITY_COLORS = [
  '#6b7280', // gray-600 (severity 1)
  '#eab308', // yellow-600 (severity 2)
  '#f97316', // orange-600 (severity 3)
  '#dc2626', // red-600 (severity 4)
  '#991b1b', // red-800 (severity 5)
];

const SEVERITY_LABELS = [
  'Minor (1)',
  'Low (2)',
  'Medium (3)',
  'High (4)',
  'Critical (5)'
];

export default function SeverityDistChart({
  data,
  title = 'Severity Distribution',
  height = 300
}: SeverityDistChartProps) {
  if (data.length === 0 || data.every(d => d.count === 0)) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-sm text-gray-600">No severity data available.</p>
      </div>
    );
  }

  // Prepare data for pie chart
  const chartData = data
    .map(item => ({
      name: SEVERITY_LABELS[item.severity - 1] || `Severity ${item.severity}`,
      value: item.count,
      severity: item.severity
    }))
    .filter(item => item.value > 0); // Only show non-zero values

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={SEVERITY_COLORS[entry.severity - 1]}
              />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;

              const data = payload[0].payload;
              const percentage = ((data.value / total) * 100).toFixed(1);

              return (
                <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3">
                  <p className="font-semibold text-gray-900 mb-1">{data.name}</p>
                  <p className="text-sm text-gray-600">Count: {data.value}</p>
                  <p className="text-sm text-gray-600">Percentage: {percentage}%</p>
                </div>
              );
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value, entry: any) => {
              const percentage = ((entry.payload.value / total) * 100).toFixed(1);
              return `${value} (${entry.payload.value}, ${percentage}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {chartData.map((item, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: SEVERITY_COLORS[item.severity - 1] }}
              ></div>
              <span className="text-gray-700">{item.name}</span>
            </div>
            <span className="text-gray-900 font-medium">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 text-center">
        <span className="text-sm text-gray-600">Total Issues: </span>
        <span className="text-sm text-gray-900 font-semibold">{total}</span>
      </div>
    </div>
  );
}
