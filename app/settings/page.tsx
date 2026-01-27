'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, User, HelpCircle, Target, TrendingDown, BarChart3, AlertTriangle, CheckCircle, Link as LinkIcon } from 'lucide-react';
import SalesforceConnector from '@/components/SalesforceConnector';

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    getUser();
  }, []);

  async function getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* What is this? Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-6">
            <HelpCircle className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">What is this?</h2>
          </div>

          <div className="space-y-6 text-gray-700">
            {/* Overview */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Overview</h3>
              <p className="leading-relaxed">
                This is a <strong>Friction Intelligence Platform</strong> that helps Customer Success and Account Management teams
                proactively identify and address customer issues before they escalate into churn risks. By analyzing support
                case data from Salesforce, the platform surfaces patterns of friction across your customer portfolio and
                provides actionable insights for customer visits and quarterly business reviews.
              </p>
            </div>

            {/* Purpose */}
            <div className="border-t pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Purpose</h3>
              </div>
              <ul className="space-y-2 ml-6">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span><strong>Early Warning System:</strong> Detect friction signals before customers become at-risk</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span><strong>Data-Driven Conversations:</strong> Walk into customer meetings with specific, evidence-based talking points</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span><strong>Portfolio Intelligence:</strong> Understand which issues are systemic vs. account-specific</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span><strong>Product Feedback Loop:</strong> Aggregate friction themes to inform product roadmap decisions</span>
                </li>
              </ul>
            </div>

            {/* How to Use */}
            <div className="border-t pt-6">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">How to Use This Platform</h3>
              </div>

              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Step 1: Sync Your Data</h4>
                  <p className="text-sm">
                    Click <strong>"Sync Now"</strong> on the Dashboard to pull the latest case data from Salesforce.
                    The system will automatically sync cases from your Top 25 accounts (by ARR) and analyze them using
                    AI to identify friction signals.
                  </p>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Step 2: Review Your Dashboard</h4>
                  <p className="text-sm mb-2">The Dashboard shows:</p>
                  <ul className="text-sm space-y-1 ml-4">
                    <li>• <strong>OFI Score</strong> (0-100): Lower is better. 70+ = Critical, 40-69 = Moderate, 0-39 = Healthy</li>
                    <li>• <strong>Case Volume Trends:</strong> Unusual spikes in support volume indicate potential issues</li>
                    <li>• <strong>Software Filter:</strong> View EDGE or SiteLink customers separately</li>
                    <li>• <strong>Key Themes:</strong> Common friction patterns across your portfolio</li>
                  </ul>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Step 3: Drill Into Account Details</h4>
                  <p className="text-sm mb-2">
                    Click any account to see detailed friction analysis including:
                  </p>
                  <ul className="text-sm space-y-1 ml-4">
                    <li>• <strong>Friction Cards:</strong> AI-analyzed support cases showing severity, sentiment, and themes</li>
                    <li>• <strong>Volume Analysis:</strong> How their case volume compares to their historical baseline and peers</li>
                    <li>• <strong>Case Origins:</strong> Which channels customers are using (email, phone, chat, etc.)</li>
                    <li>• <strong>Trend Charts:</strong> OFI score trajectory over the last 90 days</li>
                  </ul>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Step 4: Generate Visit Briefings</h4>
                  <p className="text-sm">
                    On any account page, click <strong>"Generate Briefing"</strong> to create a customer visit prep document.
                    Choose <strong>Quick Briefing</strong> (2-3 min read) for tactical check-ins or <strong>Deep Dive Briefing</strong>
                    (10 min read) for QBRs and strategic conversations. Export to PDF to share with your team.
                  </p>
                </div>
              </div>
            </div>

            {/* Key Metrics Explained */}
            <div className="border-t pt-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                <h3 className="text-lg font-semibold text-gray-900">Key Metrics Explained</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm mb-1">OFI Score (Operational Friction Index)</h4>
                  <p className="text-sm">
                    A 0-100 score where <strong>lower is better</strong>. Calculated from case volume, severity distribution,
                    and friction themes. Think of it as an inverse health score - the higher the number, the more operational
                    friction the customer is experiencing.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 text-sm mb-1">Severity Levels</h4>
                  <p className="text-sm">
                    AI assigns severity 1-5 to each friction card: 1 = Minor inconvenience, 3 = Workflow blocker,
                    5 = Critical system failure. High severity cards require immediate attention.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 text-sm mb-1">Friction Themes</h4>
                  <p className="text-sm">
                    Common categories like Integration Failures, UI Confusion, Billing Issues, etc. When the same theme
                    appears multiple times, it suggests a systemic problem worth escalating to Product or Engineering.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 text-sm mb-1">Peer Comparison</h4>
                  <p className="text-sm">
                    Shows how an account's case volume ranks among similar accounts (same software product: EDGE or SiteLink).
                    Helps identify whether high volume is normal for that customer profile or a warning sign.
                  </p>
                </div>
              </div>
            </div>

            {/* Best Practices */}
            <div className="border-t pt-6">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">Best Practices</h3>
              </div>

              <ul className="space-y-2 ml-6">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Weekly Sync:</strong> Run "Sync Now" at least once per week to keep data fresh</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Pre-Meeting Prep:</strong> Generate briefings 24 hours before customer meetings</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Track Trends:</strong> Monitor OFI score changes over time, not just absolute values</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Escalate Patterns:</strong> When a theme affects multiple accounts, share with Product team</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Investigate Spikes:</strong> Sudden volume increases often indicate recent issues</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Salesforce Integration Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <LinkIcon className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Salesforce Integration</h2>
          </div>
          <SalesforceConnector />
        </div>

        {/* Account Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-6 h-6 text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Account</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Email</label>
              <p className="text-gray-900 mt-1">{user?.email}</p>
            </div>

            <div className="pt-4 border-t">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
