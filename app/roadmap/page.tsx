'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import JiraSyncButton from '@/components/JiraSyncButton';
import RoadmapTab from '@/components/RoadmapTab';

export default function RoadmapPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);

  useEffect(() => {
    checkJiraIntegration();
  }, []);

  async function checkJiraIntegration() {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/');
        return;
      }

      // Check if Jira is connected
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('integration_type', 'jira')
        .eq('status', 'active')
        .single();

      setJiraIntegration(integration);
    } catch (error) {
      console.error('Error checking Jira integration:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading roadmap...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/dashboard"
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              ← Back to Dashboard
            </Link>
            {jiraIntegration && <JiraSyncButton />}
          </div>
        </div>

        {!jiraIntegration && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <p className="text-blue-900 font-medium mb-2">Connect Jira to Get Started</p>
            <p className="text-sm text-blue-700 mb-4">
              Link your Jira instance to track tickets and sync friction themes with your product roadmap
            </p>
            <Link
              href="/integrations"
              className="inline-block px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100"
            >
              Connect Jira
            </Link>
          </div>
        )}

        {jiraIntegration && <RoadmapTab />}
      </div>
    </div>
  );
}
