import { AccountWithMetrics } from '@/types';
import { PortfolioKPIs, ThemeData, DateRange } from './reportTypes';

/**
 * Calculate portfolio-wide KPIs from account data
 */
export function calculatePortfolioKPIs(accounts: AccountWithMetrics[]): PortfolioKPIs {
  const totalAccounts = accounts.length;

  if (totalAccounts === 0) {
    return {
      totalAccounts: 0,
      avgOfiScore: 0,
      highRiskCount: 0,
      trendingWorse: 0,
      trendingBetter: 0,
      totalCases: 0,
      totalAlerts: 0
    };
  }

  const avgOfiScore = accounts.reduce((sum, acc) =>
    sum + (acc.current_snapshot?.ofi_score || 0), 0) / totalAccounts;

  const highRiskCount = accounts.filter(acc =>
    (acc.current_snapshot?.ofi_score || 0) >= 70).length;

  const trendingWorse = accounts.filter(acc =>
    acc.current_snapshot?.trend_direction === 'worsening').length;

  const trendingBetter = accounts.filter(acc =>
    acc.current_snapshot?.trend_direction === 'improving').length;

  const totalCases = accounts.reduce((sum, acc) =>
    sum + (acc.current_snapshot?.case_volume || 0), 0);

  const totalAlerts = accounts.reduce((sum, acc) =>
    sum + (acc.alert_count || 0), 0);

  return {
    totalAccounts,
    avgOfiScore: Math.round(avgOfiScore * 10) / 10,
    highRiskCount,
    trendingWorse,
    trendingBetter,
    totalCases,
    totalAlerts
  };
}

/**
 * Aggregate theme data across accounts
 */
export function aggregateThemes(accounts: AccountWithMetrics[]): ThemeData[] {
  const themeMap = new Map<string, {
    count: number;
    totalSeverity: number;
    accounts: Set<string>;
  }>();

  accounts.forEach(account => {
    if (account.current_snapshot?.top_themes) {
      account.current_snapshot.top_themes.forEach(theme => {
        const existing = themeMap.get(theme.theme_key) || {
          count: 0,
          totalSeverity: 0,
          accounts: new Set()
        };

        existing.count += theme.count;
        existing.totalSeverity += theme.avg_severity * theme.count;
        existing.accounts.add(account.id);

        themeMap.set(theme.theme_key, existing);
      });
    }
  });

  const themes: ThemeData[] = [];
  themeMap.forEach((data, theme_key) => {
    themes.push({
      theme_key,
      display_name: formatThemeName(theme_key),
      count: data.count,
      avgSeverity: Math.round((data.totalSeverity / data.count) * 10) / 10,
      affectedAccounts: data.accounts.size
    });
  });

  // Sort by count descending
  return themes.sort((a, b) => b.count - a.count);
}

/**
 * Format theme key to display name
 */
export function formatThemeName(themeKey: string): string {
  const themeNames: Record<string, string> = {
    billing_confusion: 'Billing & Payments',
    integration_failures: 'Integration Issues',
    ui_confusion: 'UI/UX Confusion',
    performance_issues: 'Performance Problems',
    missing_features: 'Missing Features',
    training_gaps: 'Training Needs',
    support_response_time: 'Support Response',
    data_quality: 'Data Quality',
    reporting_issues: 'Reporting Problems',
    access_permissions: 'Access & Permissions',
    configuration_problems: 'Configuration Issues',
    notification_issues: 'Notifications',
    workflow_inefficiency: 'Workflow Issues',
    mobile_issues: 'Mobile Problems',
    documentation_gaps: 'Documentation',
    other: 'Other Issues'
  };

  return themeNames[themeKey] || themeKey.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Get severity color class
 */
export function getSeverityColor(severity: number): string {
  if (severity >= 4) return 'text-red-600 bg-red-100';
  if (severity >= 3) return 'text-orange-600 bg-orange-100';
  if (severity >= 2) return 'text-yellow-600 bg-yellow-100';
  return 'text-gray-600 bg-gray-100';
}

/**
 * Get OFI score color class
 */
export function getOfiColor(score: number): string {
  if (score >= 70) return 'text-red-600 bg-red-100';
  if (score >= 40) return 'text-yellow-600 bg-yellow-100';
  return 'text-green-600 bg-green-100';
}

/**
 * Get trend icon name
 */
export function getTrendIcon(trend?: string): string {
  if (trend === 'worsening') return 'TrendingUp';
  if (trend === 'improving') return 'TrendingDown';
  return 'Minus';
}

/**
 * Get trend color
 */
export function getTrendColor(trend?: string): string {
  if (trend === 'worsening') return 'text-red-600';
  if (trend === 'improving') return 'text-green-600';
  return 'text-gray-600';
}

/**
 * Filter accounts by date range (based on snapshot date)
 */
export function filterAccountsByDateRange(
  accounts: AccountWithMetrics[],
  dateRange: DateRange
): AccountWithMetrics[] {
  return accounts.filter(account => {
    if (!account.current_snapshot?.snapshot_date) return false;

    const snapshotDate = new Date(account.current_snapshot.snapshot_date);
    return snapshotDate >= dateRange.start && snapshotDate <= dateRange.end;
  });
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format date
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Get high-risk accounts (OFI >= 70)
 */
export function getHighRiskAccounts(accounts: AccountWithMetrics[]): AccountWithMetrics[] {
  return accounts
    .filter(acc => (acc.current_snapshot?.ofi_score || 0) >= 70)
    .sort((a, b) => (b.current_snapshot?.ofi_score || 0) - (a.current_snapshot?.ofi_score || 0));
}

/**
 * Get top themes (top N by count)
 */
export function getTopThemes(themes: ThemeData[], count: number = 5): ThemeData[] {
  return themes.slice(0, count);
}

/**
 * Calculate action item priority
 */
export function calculatePriority(
  severity: number,
  trend: string | undefined,
  ofiScore: number
): 'critical' | 'high' | 'medium' | 'low' {
  // Critical: High severity + worsening trend + high OFI
  if (severity >= 4 && trend === 'worsening' && ofiScore >= 70) return 'critical';

  // High: High severity or (medium severity + worsening + medium-high OFI)
  if (severity >= 4 || (severity >= 3 && trend === 'worsening' && ofiScore >= 50)) return 'high';

  // Medium: Medium severity or improving accounts with issues
  if (severity >= 3 || (severity >= 2 && ofiScore >= 40)) return 'medium';

  // Low: Everything else
  return 'low';
}
