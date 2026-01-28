'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { DateRange, getDateRangePresets } from '@/lib/reports/reportTypes';

interface DateRangePickerProps {
  value: DateRange;
  onChange: (dateRange: DateRange) => void;
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const presets = getDateRangePresets();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
      >
        <Calendar className="w-4 h-4 text-gray-600" />
        <span className="text-gray-700">{value.label}</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-300 rounded-lg shadow-lg z-20">
            <div className="p-2">
              <div className="text-xs font-medium text-gray-500 uppercase px-2 py-1 mb-1">
                Quick Select
              </div>
              {presets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onChange(preset);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                    value.label === preset.label ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
