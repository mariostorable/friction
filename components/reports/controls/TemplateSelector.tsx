'use client';

import { ReportTemplate, REPORT_TEMPLATES } from '@/lib/reports/reportTypes';
import * as Icons from 'lucide-react';

interface TemplateSelectorProps {
  selectedTemplate: ReportTemplate;
  onSelect: (template: ReportTemplate) => void;
}

export default function TemplateSelector({ selectedTemplate, onSelect }: TemplateSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {REPORT_TEMPLATES.map((template) => {
        const Icon = (Icons as any)[template.icon];
        const isSelected = selectedTemplate === template.id;

        return (
          <button
            key={template.id}
            onClick={() => onSelect(template.id)}
            className={`relative p-6 rounded-lg border-2 text-left transition-all ${
              isSelected
                ? 'border-blue-600 bg-blue-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            {isSelected && (
              <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                <Icons.Check className="w-4 h-4 text-white" />
              </div>
            )}

            <div className="flex items-start gap-4 mb-3">
              <div className={`p-3 rounded-lg ${
                isSelected ? 'bg-blue-100' : 'bg-gray-100'
              }`}>
                <Icon className={`w-6 h-6 ${
                  isSelected ? 'text-blue-600' : 'text-gray-600'
                }`} />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className={`text-lg font-semibold mb-1 ${
                  isSelected ? 'text-blue-900' : 'text-gray-900'
                }`}>
                  {template.name}
                </h3>
                <p className="text-xs text-gray-600 mb-2">
                  <span className="font-medium">For:</span> {template.audience}
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {template.description}
            </p>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Icons.Clock className="w-3 h-3" />
              <span>{template.estimatedTime}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
