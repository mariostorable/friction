'use client';

import { useState } from 'react';
import CustomReports from './CustomReports';
import ThemeResolutionReport from './ThemeResolutionReport';

interface ReportsHubProps {
  allAccounts: any[];
}

export default function ReportsHub({ allAccounts }: ReportsHubProps) {
  const [selectedReport, setSelectedReport] = useState<'accounts' | 'theme_resolution'>('accounts');

  return (
    <div className="space-y-6">
      {/* Report Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Report
        </label>
        <select
          value={selectedReport}
          onChange={(e) => setSelectedReport(e.target.value as 'accounts' | 'theme_resolution')}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="accounts">Account Friction Report</option>
          <option value="theme_resolution">Theme Resolution Status (Jira)</option>
        </select>
      </div>

      {/* Report Display */}
      {selectedReport === 'accounts' && <CustomReports allAccounts={allAccounts} />}
      {selectedReport === 'theme_resolution' && <ThemeResolutionReport />}
    </div>
  );
}
