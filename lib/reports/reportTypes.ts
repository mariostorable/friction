import { AccountWithMetrics } from '@/types';

export type ReportTemplate =
  | 'executive-summary'
  | 'account-deep-dive'
  | 'product-health'
  | 'csm-territory'
  | 'theme-analysis';

export interface DateRange {
  start: Date;
  end: Date;
  label: string; // "Last 30 days", "Last 90 days", etc.
}

export interface ReportFilters {
  dateRange: DateRange;
  products?: ('edge' | 'sitelink' | 'other')[];
  segments?: ('smb' | 'mid_market' | 'enterprise')[];
  accountIds?: string[];
  themes?: string[];
  minOfiScore?: number;
  maxOfiScore?: number;
}

export interface PortfolioKPIs {
  totalAccounts: number;
  avgOfiScore: number;
  highRiskCount: number; // OFI >= 70
  trendingWorse: number;
  trendingBetter: number;
  totalCases: number;
  totalAlerts: number;
}

export interface ThemeData {
  theme_key: string;
  display_name: string;
  count: number;
  avgSeverity: number;
  affectedAccounts: number;
  trend?: 'increasing' | 'decreasing' | 'stable';
}

export interface AccountHealthData {
  account: AccountWithMetrics;
  ofiScore: number;
  trend: 'improving' | 'stable' | 'worsening';
  caseVolume: number;
  topThemes: ThemeData[];
  recentHighSeverityIssues: FrictionIssue[];
  quickWins: FrictionIssue[];
  caseVolumeVsAccountAvg: number; // percentage
  caseVolumeVsPortfolioAvg: number; // percentage
}

export interface FrictionIssue {
  id: string;
  summary: string;
  severity: number;
  theme: string;
  created_date: string;
  salesforce_url?: string;
  evidence?: string[];
}

export interface ActionItem {
  account_id: string;
  account_name: string;
  issue: string;
  recommended_action: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  severity: number;
  theme?: string;
}

export interface ReportMetadata {
  template: ReportTemplate;
  generatedAt: Date;
  dateRange: DateRange;
  filters: ReportFilters;
  accountCount: number;
}

export interface TemplateInfo {
  id: ReportTemplate;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  audience: string;
  estimatedTime: string; // "2-3 minutes"
}

export const REPORT_TEMPLATES: TemplateInfo[] = [
  {
    id: 'executive-summary',
    name: 'Executive Summary',
    description: 'High-level portfolio health overview with key metrics, top friction themes, and at-risk accounts.',
    icon: 'BarChart3',
    audience: 'Leadership, Quarterly Reviews',
    estimatedTime: '2-3 minutes'
  },
  {
    id: 'account-deep-dive',
    name: 'Account Deep Dive',
    description: 'Detailed analysis of 1-3 specific accounts including friction trends, top issues, and recommendations.',
    icon: 'Target',
    audience: 'CSMs, Account Planning',
    estimatedTime: '3-5 minutes'
  },
  {
    id: 'product-health',
    name: 'Product Health',
    description: 'Product-specific friction patterns, theme breakdowns, and severity analysis across your portfolio.',
    icon: 'Package',
    audience: 'Product Teams, Engineering',
    estimatedTime: '4-6 minutes'
  },
  {
    id: 'csm-territory',
    name: 'CSM Territory',
    description: 'Personal portfolio health dashboard with action items, alerts, and performance vs portfolio average.',
    icon: 'Users',
    audience: 'Individual CSMs',
    estimatedTime: '2-4 minutes'
  },
  {
    id: 'theme-analysis',
    name: 'Theme Analysis',
    description: 'Deep dive into specific friction themes with root cause analysis and affected account lists.',
    icon: 'Layers',
    audience: 'Support Leadership',
    estimatedTime: '5-7 minutes'
  }
];

// Helper function to get date range presets
export function getDateRangePresets(): DateRange[] {
  const now = new Date();

  return [
    {
      start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      end: now,
      label: 'Last 30 days'
    },
    {
      start: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
      end: now,
      label: 'Last 60 days'
    },
    {
      start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      end: now,
      label: 'Last 90 days'
    },
    {
      start: new Date(now.getFullYear(), 0, 1),
      end: now,
      label: 'Year to date'
    }
  ];
}

// Helper to get default filters
export function getDefaultFilters(): ReportFilters {
  const presets = getDateRangePresets();
  return {
    dateRange: presets[2], // Last 90 days
    products: undefined,
    segments: undefined,
    accountIds: undefined,
    themes: undefined,
    minOfiScore: undefined,
    maxOfiScore: undefined
  };
}
