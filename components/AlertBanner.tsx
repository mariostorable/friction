'use client';

import { Alert } from '@/types';
import { AlertCircle, X } from 'lucide-react';

interface AlertBannerProps {
  alert: Alert;
  onDismiss?: (id: string) => void;
}

export default function AlertBanner({ alert, onDismiss }: AlertBannerProps) {
  const severityColors = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    high: 'bg-orange-50 border-orange-200 text-orange-800',
    medium: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    low: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const severityIcons = {
    critical: 'text-red-500',
    high: 'text-orange-500',
    medium: 'text-yellow-500',
    low: 'text-blue-500',
  };

  return (
    <div className={`rounded-lg border p-4 ${severityColors[alert.severity]}`}>
      <div className="flex items-start">
        <AlertCircle className={`h-5 w-5 ${severityIcons[alert.severity]} flex-shrink-0`} />
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium">{alert.title}</h3>
          <div className="mt-1 text-sm">
            <p>{alert.message}</p>
          </div>
          {alert.recommended_action && (
            <div className="mt-2 text-sm">
              <p className="font-medium">Recommended action:</p>
              <p className="mt-1">{alert.recommended_action}</p>
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(alert.id)}
            className="ml-3 inline-flex rounded-md p-1.5 hover:bg-black/5 focus:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
