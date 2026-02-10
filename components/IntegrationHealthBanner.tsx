'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface HealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  integrations: Array<{
    type: string;
    status: string;
    issues: string[];
  }>;
}

export default function IntegrationHealthBanner() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if user has dismissed the banner in this session
    const isDismissed = sessionStorage.getItem('health_banner_dismissed');
    if (isDismissed) {
      setDismissed(true);
      return;
    }

    // Check integration health
    fetch('/api/integrations/health')
      .then(res => res.json())
      .then(data => {
        if (data.overall !== 'healthy') {
          setHealth(data);
        }
      })
      .catch(err => console.error('Health check failed:', err));
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('health_banner_dismissed', 'true');
  };

  const handleReconnect = () => {
    router.push('/settings');
  };

  if (!health || dismissed || health.overall === 'healthy') {
    return null;
  }

  const criticalIntegrations = health.integrations.filter(i => i.status === 'critical');

  if (criticalIntegrations.length === 0) {
    return null;
  }

  return (
    <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">
            Integration Connection Lost
          </h3>
          <div className="mt-2 text-sm text-red-700">
            <p>
              Your {criticalIntegrations.map(i => i.type).join(', ')} integration has lost its connection.
              Data sync is currently disabled.
            </p>
            <ul className="list-disc list-inside mt-1">
              {criticalIntegrations.map((integration, index) => (
                <li key={index}>
                  <strong>{integration.type}:</strong> {integration.issues.join(', ')}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleReconnect}
              className="text-sm font-medium text-red-800 hover:text-red-900 underline"
            >
              Reconnect in Settings →
            </button>
            <button
              onClick={handleDismiss}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
