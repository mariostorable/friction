'use client';

import { useState } from 'react';
import { FileText, Download, X, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Account, FrictionCard, AccountSnapshot } from '@/types';
import jsPDF from 'jspdf';

interface VisitBriefingProps {
  account: Account;
  frictionCards: FrictionCard[];
  snapshot: AccountSnapshot | null;
}

interface BriefingData {
  account_name: string;
  visit_date: string;
  arr: string;
  vertical: string;
  segment: string;
  ofi_score: number;
  trend: string;
  attention_items: Array<{
    title: string;
    severity: string;
    details: string;
  }>;
  talking_points: string[];
  wins: string[];
  detailed_analysis?: any;
}

export default function VisitBriefing({ account, frictionCards, snapshot }: VisitBriefingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [briefingType, setBriefingType] = useState<'quick' | 'deep' | null>(null);

  async function generateBriefing(type: 'quick' | 'deep') {
    setLoading(true);
    setBriefingType(type);
    setBriefing(null);

    try {
      const response = await fetch('/api/briefing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: account.id,
          briefing_type: type,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate briefing');
      const data = await response.json();
      setBriefing(data.briefing);
    } catch (error) {
      console.error('Error generating briefing:', error);
      alert('Failed to generate briefing. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function downloadAsPDF() {
    if (!briefing) return;
    const doc = new jsPDF();
    doc.text('Visit Briefing', 14, 20);
    doc.text(briefing.account_name, 14, 30);
    doc.text('OFI Score: ' + briefing.ofi_score, 14, 40);
    doc.save(account.name.replace(/\s+/g, '_') + '_Briefing.pdf');
  }

  function resetBriefing() {
    setBriefing(null);
    setBriefingType(null);
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
      >
        <FileText className="w-4 h-4" />
        Visit Briefing
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Visit Briefing</h2>
            <p className="text-sm text-gray-600 mt-1">{account.name}</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {!briefing && !loading ? (
            <div className="space-y-6">
              <p className="text-gray-600">Generate a briefing to prepare for your customer visit:</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => generateBriefing('quick')}
                  className="group p-6 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200">
                      <FileText className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Quick Briefing</h3>
                      <p className="text-sm text-gray-600">Essential talking points and top friction issues</p>
                      <p className="text-xs text-gray-500 mt-2">~30 seconds</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => generateBriefing('deep')}
                  className="group p-6 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200">
                      <FileText className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Deep Dive</h3>
                      <p className="text-sm text-gray-600">Comprehensive analysis with history and recommendations</p>
                      <p className="text-xs text-gray-500 mt-2">~60 seconds</p>
                    </div>
                  </div>
                </button>
              </div>

              {snapshot && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-900">Current OFI Score</p>
                      <p className="text-3xl font-bold text-blue-600 mt-1">{snapshot.ofi_score}</p>
                    </div>
                    <div className="text-right text-sm text-blue-700">
                      <p>{frictionCards.length} friction points</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-purple-600 mb-4" />
              <p className="text-lg font-medium text-gray-900">Generating briefing...</p>
            </div>
          ) : briefing ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b">
                <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">
                  {briefingType === 'quick' ? 'Quick Briefing' : 'Deep Dive'}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={resetBriefing}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    <RefreshCw className="w-4 h-4" />
                    New
                  </button>
                  <button
                    onClick={downloadAsPDF}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    <Download className="w-4 h-4" />
                    PDF
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-600">ARR: {briefing.arr}</p>
                    <p className="text-sm text-gray-600">{briefing.vertical} | {briefing.segment}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">OFI Score</p>
                    <p className="text-3xl font-bold text-blue-600">{briefing.ofi_score}</p>
                    <p className="text-sm text-gray-600">{briefing.trend}</p>
                  </div>
                </div>
              </div>

              {briefing.attention_items?.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold mb-3">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    Items Requiring Attention
                  </h3>
                  <div className="space-y-3">
                    {briefing.attention_items.map((item, idx) => (
                      <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="font-semibold text-red-900">{item.title}</p>
                        <p className="text-sm text-red-700 mt-1">{item.details}</p>
                        <span className="inline-block mt-2 px-2 py-1 bg-red-200 text-red-800 text-xs rounded">
                          {item.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {briefing.talking_points?.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">💬 Key Talking Points</h3>
                  <ul className="space-y-2">
                    {briefing.talking_points.map((point, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-purple-600">•</span>
                        <span className="text-gray-700">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {briefing.wins?.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">🎯 Recent Wins</h3>
                  <ul className="space-y-2">
                    {briefing.wins.map((win, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-green-600">•</span>
                        <span className="text-gray-700">{win}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
