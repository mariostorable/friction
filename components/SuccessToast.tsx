'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle, Copy, Check } from 'lucide-react';

interface SuccessToastProps {
  message: string;
  onClose: () => void;
  autoClose?: boolean; // Optional: defaults to true
}

export default function SuccessToast({ message, onClose, autoClose = true }: SuccessToastProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!autoClose) return; // Don't auto-close if disabled

    const timer = setTimeout(onClose, 5000); // Auto-close after 5 seconds
    return () => clearTimeout(timer);
  }, [onClose, autoClose]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-lg animate-slide-up">
      <div className="bg-green-50 border-l-4 border-green-500 rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <pre className="text-sm text-green-900 font-medium whitespace-pre-wrap font-sans">{message}</pre>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={copyToClipboard}
              className="p-1 hover:bg-green-100 rounded transition-colors"
              title="Copy message"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-green-600" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-green-100 rounded transition-colors"
              title="Close"
            >
              <X className="w-4 h-4 text-green-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
