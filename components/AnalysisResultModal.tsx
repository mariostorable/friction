'use client';

import { X, Copy, CheckCircle } from 'lucide-react';
import { useState } from 'react';

interface AnalysisResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountName: string;
  accountId: string;
  synced: number;
  analyzed: number;
  ofiScore: number;
  highSeverity: number;
  remaining?: number;
}

export default function AnalysisResultModal({
  isOpen,
  onClose,
  accountName,
  accountId,
  synced,
  analyzed,
  ofiScore,
  highSeverity,
  remaining
}: AnalysisResultModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Calculate total and processed
  const totalCases = analyzed + (remaining || 0);
  const processedCount = analyzed;
  const progressPercentage = totalCases > 0 ? Math.round((processedCount / totalCases) * 100) : 0;

  const resultText = `✅ Analysis Complete!

Account: ${accountName}
Account ID: ${accountId}

${synced > 0 ? `New cases synced: ${synced}\n` : ''}Analyzed this batch: ${analyzed} friction points
Progress: ${processedCount} of ${totalCases} cases (${progressPercentage}%)
OFI Score: ${ofiScore}
High Severity: ${highSeverity}${remaining ? `\n\n⚠️ ${remaining} cases remaining - click Analyze again to continue` : ''}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Analysis Complete
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - User can select text here */}
        <div className="p-6">
          {/* Account Info */}
          <div className="mb-4 pb-4 border-b border-gray-200 select-text">
            <div className="text-sm">
              <div className="font-semibold text-gray-900 mb-1">{accountName}</div>
              <div className="text-xs text-gray-500 font-mono">{accountId}</div>
            </div>
          </div>

          {/* Results */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 select-text">
            <div className="space-y-2 text-sm font-mono">
              {synced > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">New cases synced:</span>
                  <span className="font-semibold text-gray-900">{synced}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Analyzed this batch:</span>
                <span className="font-semibold text-gray-900">{analyzed} friction points</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Progress:</span>
                <span className="font-semibold text-gray-900">{processedCount} of {totalCases} cases ({progressPercentage}%)</span>
              </div>
              <div className="pt-2 mt-2 border-t border-gray-200"></div>
              <div className="flex justify-between">
                <span className="text-gray-600">OFI Score:</span>
                <span className="font-semibold text-gray-900">{ofiScore}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">High Severity:</span>
                <span className="font-semibold text-gray-900">{highSeverity}</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {totalCases > 0 && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                {progressPercentage}% complete
              </p>
            </div>
          )}

          {remaining && remaining > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium">
                ⚠️ {remaining} cases remaining - click Analyze again to continue
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Copy className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy Results'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close & Reload
          </button>
        </div>
      </div>
    </div>
  );
}
