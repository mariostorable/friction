'use client';

import { useEffect, useState } from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';

interface ErrorToastProps {
  title: string;
  message: string;
  details?: string;
  onClose: () => void;
}

export default function ErrorToast({ title, message, details, onClose }: ErrorToastProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(onClose, 10000); // Auto-close after 10 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  const copyToClipboard = () => {
    const fullError = `${title}\n\n${message}${details ? '\n\nDetails: ' + details : ''}`;
    navigator.clipboard.writeText(fullError);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md animate-slide-up">
      <div className="bg-red-50 border-l-4 border-red-500 rounded-lg shadow-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-red-900">{title}</h3>
            </div>
            <p className="text-sm text-red-800 mb-2">{message}</p>
            {details && (
              <div className="mt-2 p-2 bg-red-100 rounded text-xs font-mono text-red-900 overflow-x-auto">
                {details}
              </div>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={copyToClipboard}
              className="p-1 hover:bg-red-100 rounded transition-colors"
              title="Copy error"
            >
              {copied ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-red-600" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-red-100 rounded transition-colors"
              title="Close"
            >
              <X className="w-4 h-4 text-red-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
