'use client';

import { useEffect } from 'react';
import { X, CheckCircle } from 'lucide-react';

interface SuccessToastProps {
  message: string;
  onClose: () => void;
}

export default function SuccessToast({ message, onClose }: SuccessToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000); // Auto-close after 5 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md animate-slide-up">
      <div className="bg-green-50 border-l-4 border-green-500 rounded-lg shadow-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-900 font-medium">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-green-100 rounded transition-colors flex-shrink-0"
            title="Close"
          >
            <X className="w-4 h-4 text-green-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
