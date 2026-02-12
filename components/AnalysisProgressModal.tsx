'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

interface AnalysisProgressModalProps {
  isOpen: boolean;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  elapsedSeconds: number;
}

const STEPS = [
  { id: 1, name: 'Syncing Salesforce cases', description: 'Fetching latest support cases' },
  { id: 2, name: 'Pulling Jira tickets', description: 'Getting product fixes and roadmap' },
  { id: 3, name: 'Analyzing with Claude AI', description: 'Processing friction signals' },
  { id: 4, name: 'Calculating OFI score', description: 'Computing friction index' },
  { id: 5, name: 'Linking themes to Jira', description: 'Connecting issues to tickets' },
];

export default function AnalysisProgressModal({
  isOpen,
  currentStep,
  totalSteps,
  stepName,
  elapsedSeconds,
}: AnalysisProgressModalProps) {
  if (!isOpen) return null;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900">Analyzing Account</h3>
          <p className="text-sm text-gray-600 mt-1">
            This may take 1-3 minutes depending on data volume
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-700 font-medium">
              Step {currentStep} of {totalSteps}
            </span>
            <span className="text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(elapsedSeconds)}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-3">
          {STEPS.map((step) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;
            const isPending = step.id > currentStep;

            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                  isCurrent ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isCompleted && (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                  {isCurrent && (
                    <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                  )}
                  {isPending && (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium ${
                      isCompleted
                        ? 'text-gray-500'
                        : isCurrent
                        ? 'text-purple-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {step.name}
                  </div>
                  <div
                    className={`text-xs ${
                      isCurrent ? 'text-purple-600' : 'text-gray-500'
                    }`}
                  >
                    {step.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Note */}
        <div className="mt-6 p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>💡 Tip:</strong> The hourly cron job handles most analysis automatically.
            Manual analysis is only needed for recent changes or urgent updates.
          </p>
        </div>
      </div>
    </div>
  );
}
