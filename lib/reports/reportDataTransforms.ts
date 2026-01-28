import { AccountWithMetrics } from '@/types';
import {
  ReportFilters,
  AccountHealthData,
  FrictionIssue,
  ThemeData,
  ActionItem
} from './reportTypes';
import {
  aggregateThemes,
  formatThemeName,
  calculatePriority
} from './reportCalculations';

/**
 * Apply filters to account list
 */
export function applyFilters(
  accounts: AccountWithMetrics[],
  filters: ReportFilters
): AccountWithMetrics[] {
  let filtered = [...accounts];

  // Filter by products
  if (filters.products && filters.products.length > 0) {
    filtered = filtered.filter(acc => {
      const vertical = acc.vertical?.toLowerCase() || '';
      return filters.products!.some(product => {
        if (product === 'edge') return vertical.includes('edge');
        if (product === 'sitelink') return vertical.includes('sitelink');
        return !vertical.includes('edge') && !vertical.includes('sitelink');
      });
    });
  }

  // Filter by segments
  if (filters.segments && filters.segments.length > 0) {
    filtered = filtered.filter(acc =>
      acc.segment && filters.segments!.includes(acc.segment as any)
    );
  }

  // Filter by account IDs
  if (filters.accountIds && filters.accountIds.length > 0) {
    filtered = filtered.filter(acc =>
      filters.accountIds!.includes(acc.id)
    );
  }

  // Filter by OFI score range
  if (filters.minOfiScore !== undefined) {
    filtered = filtered.filter(acc =>
      (acc.current_snapshot?.ofi_score || 0) >= filters.minOfiScore!
    );
  }

  if (filters.maxOfiScore !== undefined) {
    filtered = filtered.filter(acc =>
      (acc.current_snapshot?.ofi_score || 0) <= filters.maxOfiScore!
    );
  }

  // Filter by themes
  if (filters.themes && filters.themes.length > 0) {
    filtered = filtered.filter(acc => {
      if (!acc.current_snapshot?.top_themes) return false;
      const accountThemes = acc.current_snapshot.top_themes.map(t => t.theme_key);
      return filters.themes!.some(theme => accountThemes.includes(theme));
    });
  }

  return filtered;
}

/**
 * Transform account to detailed health data
 */
export function transformToAccountHealthData(
  account: AccountWithMetrics,
  portfolioAvgCaseVolume: number
): AccountHealthData {
  const ofiScore = account.current_snapshot?.ofi_score || 0;
  const trend = (account.current_snapshot?.trend_direction || 'stable') as 'improving' | 'stable' | 'worsening';
  const caseVolume = account.current_snapshot?.case_volume || 0;

  // Get top themes
  const topThemes: ThemeData[] = (account.current_snapshot?.top_themes || [])
    .slice(0, 3)
    .map(theme => ({
      theme_key: theme.theme_key,
      display_name: formatThemeName(theme.theme_key),
      count: theme.count,
      avgSeverity: theme.avg_severity,
      affectedAccounts: 1 // This account
    }));

  // Extract high-severity issues from recent friction cards
  const recentHighSeverityIssues: FrictionIssue[] = (account.recent_friction_cards || [])
    .filter(card => card.severity >= 4)
    .slice(0, 5)
    .map(card => ({
      id: card.id,
      summary: card.summary,
      severity: card.severity,
      theme: formatThemeName(card.theme_key),
      created_date: card.created_at,
      evidence: card.evidence_snippets || []
    }));

  // Identify quick wins (low/medium severity, common issues)
  const quickWins: FrictionIssue[] = (account.recent_friction_cards || [])
    .filter(card => card.severity <= 2)
    .slice(0, 3)
    .map(card => ({
      id: card.id,
      summary: card.summary,
      severity: card.severity,
      theme: formatThemeName(card.theme_key),
      created_date: card.created_at,
      evidence: card.evidence_snippets || []
    }));

  // Calculate case volume comparisons
  // For account avg, we'd need historical data - using current as placeholder
  const caseVolumeVsAccountAvg = 0; // TODO: Calculate from historical snapshots
  const caseVolumeVsPortfolioAvg = portfolioAvgCaseVolume > 0
    ? Math.round(((caseVolume - portfolioAvgCaseVolume) / portfolioAvgCaseVolume) * 100)
    : 0;

  return {
    account,
    ofiScore,
    trend,
    caseVolume,
    topThemes,
    recentHighSeverityIssues,
    quickWins,
    caseVolumeVsAccountAvg,
    caseVolumeVsPortfolioAvg
  };
}

/**
 * Generate action items from accounts
 */
export function generateActionItems(accounts: AccountWithMetrics[]): ActionItem[] {
  const actions: ActionItem[] = [];

  accounts.forEach(account => {
    const ofiScore = account.current_snapshot?.ofi_score || 0;
    const trend = account.current_snapshot?.trend_direction;

    // High OFI accounts
    if (ofiScore >= 70) {
      actions.push({
        account_id: account.id,
        account_name: account.name,
        issue: `High friction score: ${ofiScore}`,
        recommended_action: 'Schedule urgent check-in call to understand pain points',
        priority: calculatePriority(5, trend, ofiScore),
        severity: 5
      });
    }

    // Worsening trend
    if (trend === 'worsening') {
      actions.push({
        account_id: account.id,
        account_name: account.name,
        issue: 'Friction trending worse',
        recommended_action: 'Review recent cases and proactively reach out',
        priority: calculatePriority(4, trend, ofiScore),
        severity: 4
      });
    }

    // High alert count
    if ((account.alert_count || 0) >= 2) {
      actions.push({
        account_id: account.id,
        account_name: account.name,
        issue: `${account.alert_count} active alerts`,
        recommended_action: 'Address alert conditions immediately',
        priority: 'high',
        severity: 4
      });
    }

    // Add theme-specific actions for top themes
    const topTheme = account.current_snapshot?.top_themes?.[0];
    if (topTheme && topTheme.count >= 3) {
      actions.push({
        account_id: account.id,
        account_name: account.name,
        issue: `Recurring issue: ${formatThemeName(topTheme.theme_key)} (${topTheme.count} cases)`,
        recommended_action: getRecommendedAction(topTheme.theme_key),
        priority: calculatePriority(topTheme.avg_severity, trend, ofiScore),
        severity: topTheme.avg_severity,
        theme: topTheme.theme_key
      });
    }
  });

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Get recommended action for a theme
 */
function getRecommendedAction(themeKey: string): string {
  const recommendations: Record<string, string> = {
    billing_confusion: 'Review billing documentation and schedule training session',
    integration_failures: 'Check integration logs and engage technical support',
    ui_confusion: 'Share product updates and offer UI walkthrough',
    performance_issues: 'Investigate performance metrics and escalate to engineering',
    missing_features: 'Document feature request and provide workaround',
    training_gaps: 'Schedule training session or share help documentation',
    support_response_time: 'Review support ticket SLAs and prioritize account',
    data_quality: 'Audit data import process and clean up inconsistencies',
    reporting_issues: 'Review reporting setup and provide custom report templates',
    access_permissions: 'Audit user permissions and update access levels',
    configuration_problems: 'Review configuration with customer and correct settings',
    notification_issues: 'Check notification settings and test email delivery',
    workflow_inefficiency: 'Document workflow pain points and suggest optimizations',
    mobile_issues: 'Test mobile experience and report bugs to engineering',
    documentation_gaps: 'Create custom documentation or knowledge base articles'
  };

  return recommendations[themeKey] || 'Review friction cards and determine next steps';
}

/**
 * Group accounts by product
 */
export function groupAccountsByProduct(
  accounts: AccountWithMetrics[]
): Record<string, AccountWithMetrics[]> {
  const groups: Record<string, AccountWithMetrics[]> = {
    edge: [],
    sitelink: [],
    other: []
  };

  accounts.forEach(account => {
    const products = account.products?.toLowerCase() || '';
    if (products.includes('edge')) {
      groups.edge.push(account);
    } else if (products.includes('sitelink')) {
      groups.sitelink.push(account);
    } else {
      groups.other.push(account);
    }
  });

  return groups;
}

/**
 * Aggregate theme data for a specific product
 */
export function aggregateThemesByProduct(
  accounts: AccountWithMetrics[],
  product: 'edge' | 'sitelink' | 'other'
): ThemeData[] {
  const filtered = groupAccountsByProduct(accounts)[product];
  return aggregateThemes(filtered);
}

/**
 * Calculate portfolio average case volume
 */
export function calculatePortfolioAvgCaseVolume(accounts: AccountWithMetrics[]): number {
  if (accounts.length === 0) return 0;

  const total = accounts.reduce((sum, acc) =>
    sum + (acc.current_snapshot?.case_volume || 0), 0);

  return Math.round(total / accounts.length);
}

/**
 * Sort accounts by various criteria
 */
export function sortAccounts(
  accounts: AccountWithMetrics[],
  sortBy: 'ofi' | 'arr' | 'cases' | 'name',
  direction: 'asc' | 'desc' = 'desc'
): AccountWithMetrics[] {
  const sorted = [...accounts].sort((a, b) => {
    let compareA: number | string = 0;
    let compareB: number | string = 0;

    switch (sortBy) {
      case 'ofi':
        compareA = a.current_snapshot?.ofi_score || 0;
        compareB = b.current_snapshot?.ofi_score || 0;
        break;
      case 'arr':
        compareA = a.arr || 0;
        compareB = b.arr || 0;
        break;
      case 'cases':
        compareA = a.current_snapshot?.case_volume || 0;
        compareB = b.current_snapshot?.case_volume || 0;
        break;
      case 'name':
        compareA = a.name.toLowerCase();
        compareB = b.name.toLowerCase();
        break;
    }

    if (typeof compareA === 'string') {
      return direction === 'asc'
        ? compareA.localeCompare(compareB as string)
        : (compareB as string).localeCompare(compareA);
    }

    return direction === 'asc'
      ? (compareA as number) - (compareB as number)
      : (compareB as number) - (compareA as number);
  });

  return sorted;
}
