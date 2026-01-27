'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { FileText, Download, X, Loader2, RefreshCw, AlertTriangle, ExternalLink, AlertCircle } from 'lucide-react';
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

interface CaseData {
  id: string;
  summary: string;
  severity: number;
  theme: string;
  case_id: string;
  case_date: string;
}

export default function VisitBriefing({ account, frictionCards, snapshot }: VisitBriefingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [briefingType, setBriefingType] = useState<'quick' | 'deep' | null>(null);
  const [cases, setCases] = useState<CaseData[]>([]);
  const supabase = createClientComponentClient();

  async function generateBriefing(type: 'quick' | 'deep') {
    setLoading(true);
    setBriefingType(type);
    setBriefing(null);
    setCases([]);

    try {
      const rawInputIds = frictionCards.map(c => c.raw_input_id).filter(Boolean);
      const { data: rawInputs } = await supabase
        .from('raw_inputs')
        .select('*')
        .in('id', rawInputIds);

      const casesData: CaseData[] = [];
      frictionCards.forEach(card => {
        const rawInput = rawInputs?.find(r => r.id === card.raw_input_id);
        if (rawInput?.source_id) {
          casesData.push({
            id: card.id,
            summary: card.summary,
            severity: card.severity,
            theme: card.theme_key,
            case_id: rawInput.source_id,
            case_date: rawInput.metadata?.created_date || rawInput.created_at,
          });
        }
      });

      casesData.sort((a, b) => new Date(b.case_date).getTime() - new Date(a.case_date).getTime());
      setCases(casesData);

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
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - (margin * 2);
    let y = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Visit Briefing', margin, y);
    y += 10;

    // Account name
    doc.setFontSize(14);
    doc.text(briefing.account_name, margin, y);
    y += 8;

    // Metadata
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Generated: ' + new Date().toLocaleDateString(), margin, y);
    y += 5;
    doc.text('ARR: ' + briefing.arr, margin, y);
    y += 5;
    doc.text(briefing.vertical + ' | ' + briefing.segment, margin, y);
    y += 10;

    // OFI Score
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    const score = briefing.ofi_score;
    const severityText = score >= 70 ? 'CRITICAL' : score >= 40 ? 'MODERATE' : 'HEALTHY';
    if (score >= 70) doc.setTextColor(220, 38, 38);
    else if (score >= 40) doc.setTextColor(234, 179, 8);
    else doc.setTextColor(22, 163, 74);
    doc.text('OFI Score: ' + score + ' - ' + severityText + ' (' + briefing.trend + ')', margin, y);
    doc.setTextColor(0, 0, 0);
    y += 12;

    // Attention Items
    if (briefing.attention_items && briefing.attention_items.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Items Requiring Attention', margin, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      briefing.attention_items.forEach((item, idx) => {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }
        doc.setFont('helvetica', 'bold');
        doc.text((idx + 1) + '. ' + item.title, margin + 2, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        const detailLines = doc.splitTextToSize(item.details, maxWidth - 4);
        detailLines.forEach((line: string) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, margin + 4, y);
          y += 4;
        });
        y += 3;
      });
      y += 5;
    }

    // Talking Points
    if (briefing.talking_points && briefing.talking_points.length > 0) {
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Key Talking Points', margin, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      briefing.talking_points.forEach((point) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const lines = doc.splitTextToSize('• ' + point, maxWidth - 2);
        lines.forEach((line: string) => {
          doc.text(line, margin + 2, y);
          y += 4;
        });
        y += 2;
      });
      y += 5;
    }

    // Wins
    if (briefing.wins && briefing.wins.length > 0) {
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Recent Wins', margin, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      briefing.wins.forEach((win) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const lines = doc.splitTextToSize('• ' + win, maxWidth - 2);
        lines.forEach((line: string) => {
          doc.text(line, margin + 2, y);
          y += 4;
        });
        y += 2;
      });
      y += 5;
    }

    // Support Cases
    if (cases.length > 0) {
      if (y > 220) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Support Cases (Chronological)', margin, y);
      y += 8;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      cases.forEach((caseData) => {
        if (y > 265) {
          doc.addPage();
          y = 20;
        }
        const caseDate = new Date(caseData.case_date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        const summaryLines = doc.splitTextToSize(caseData.summary, maxWidth - 4);
        summaryLines.forEach((line: string) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, margin + 2, y);
          y += 3.5;
        });
        doc.text('Date: ' + caseDate + ' | Severity: ' + caseData.severity + '/5 | ' + caseData.theme.replace(/_/g, ' '), margin + 2, y);
        y += 3;
        doc.setTextColor(0, 0, 255);
        doc.text('Salesforce Case ID: ' + caseData.case_id, margin + 2, y);
        doc.setTextColor(0, 0, 0);
        y += 5;
      });
    }

    doc.save(account.name.replace(/\s+/g, '_') + '_Briefing.pdf');
  }

  function resetBriefing() {
    setBriefing(null);
    setBriefingType(null);
    setCases([]);
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
                    <p className={`text-3xl font-bold ${
                      briefing.ofi_score >= 70 ? 'text-red-600' :
                      briefing.ofi_score >= 40 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>{briefing.ofi_score}</p>
                    <p className={`text-sm font-medium ${
                      briefing.ofi_score >= 70 ? 'text-red-700' :
                      briefing.ofi_score >= 40 ? 'text-yellow-700' :
                      'text-green-700'
                    }`}>
                      {briefing.ofi_score >= 70 ? 'CRITICAL' :
                       briefing.ofi_score >= 40 ? 'MODERATE' :
                       'HEALTHY'} - {briefing.trend}
                    </p>
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

              {cases.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">🔍 Support Cases (Chronological)</h3>
                  <div className="space-y-2">
                    {cases.map((caseData) => (
                      <div key={caseData.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{caseData.summary}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
                              <span className="flex items-center gap-1">
                                📅 {new Date(caseData.case_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              <span>Severity: {caseData.severity}/5</span>
                              <span className="px-2 py-0.5 bg-gray-200 rounded text-gray-700">
                                {caseData.theme.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>
                          <a
                            href={'https://storable.my.salesforce.com/' + caseData.case_id}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap px-3 py-1 bg-blue-50 rounded hover:bg-blue-100"
                          >
                            View Case <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
