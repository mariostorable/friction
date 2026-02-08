'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function JiraCleanupButton() {
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function cleanupLinks() {
    if (!confirm('This will delete all existing theme links and you\'ll need to re-sync. Continue?')) {
      return;
    }

    setCleaning(true);
    setResult(null);

    try {
      const response = await fetch('/api/jira/cleanup-links', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setResult(`✅ Deleted ${data.deleted_links} old theme links. Click "Sync Jira" to create new ones.`);
      } else {
        setResult(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setResult(`❌ Failed to cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={cleanupLinks}
        disabled={cleaning}
        className="w-full px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-300 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        <Trash2 className={`w-4 h-4 ${cleaning ? 'animate-pulse' : ''}`} />
        {cleaning ? 'Cleaning up...' : 'Reset Theme Links'}
      </button>

      {result && (
        <div className={`rounded-lg px-3 py-2 text-xs ${
          result.startsWith('✅')
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {result}
        </div>
      )}
    </div>
  );
}
