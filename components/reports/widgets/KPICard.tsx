'use client';

import { LucideIcon } from 'lucide-react';
import * as Icons from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  icon?: string; // Lucide icon name
  colorScheme?: 'blue' | 'green' | 'red' | 'yellow' | 'gray';
  tooltip?: string;
  subtext?: string;
}

export default function KPICard({
  label,
  value,
  trend,
  trendValue,
  icon = 'Activity',
  colorScheme = 'blue',
  tooltip,
  subtext
}: KPICardProps) {
  const colorClasses = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-blue-100' },
    green: { bg: 'bg-green-50', text: 'text-green-600', iconBg: 'bg-green-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', iconBg: 'bg-red-100' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600', iconBg: 'bg-yellow-100' },
    gray: { bg: 'bg-gray-50', text: 'text-gray-600', iconBg: 'bg-gray-100' }
  };

  const colors = colorClasses[colorScheme];

  // Get the icon component dynamically
  const IconComponent = (Icons as any)[icon] as LucideIcon;
  const TrendIcon = trend === 'up' ? Icons.TrendingUp :
                   trend === 'down' ? Icons.TrendingDown :
                   Icons.Minus;

  return (
    <div className={`${colors.bg} rounded-lg border border-gray-200 p-5 relative group`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <dt className="text-sm font-medium text-gray-500 mb-1">
            {label}
          </dt>
          <dd className="flex items-baseline">
            <div className={`text-3xl font-bold ${colors.text}`}>
              {value}
            </div>
            {trend && trendValue && (
              <div className={`ml-2 flex items-center text-sm ${
                trend === 'up' ? 'text-red-600' :
                trend === 'down' ? 'text-green-600' :
                'text-gray-600'
              }`}>
                <TrendIcon className="w-4 h-4 mr-0.5" />
                <span>{trendValue}</span>
              </div>
            )}
          </dd>
          {subtext && (
            <p className="text-xs text-gray-600 mt-1">{subtext}</p>
          )}
        </div>

        <div className={`flex-shrink-0 ${colors.iconBg} rounded-md p-3 ml-4`}>
          <IconComponent className={`h-6 w-6 ${colors.text}`} />
        </div>
      </div>

      {tooltip && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {tooltip}
          <div className="absolute top-full left-6 w-2 h-2 bg-gray-900 transform -translate-y-1 rotate-45"></div>
        </div>
      )}
    </div>
  );
}
