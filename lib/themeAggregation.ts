import { AccountWithMetrics, ThemeSummary } from '@/types';
import { extractProductType, formatThemeLabel } from './utils';

export interface ThemeWithAccounts {
  theme_key: string;
  theme_label: string;
  total_count: number;
  avg_severity: number;
  affected_accounts: {
    id: string;
    name: string;
    count: number;
    avg_severity: number;
  }[];
  severity_distribution: {
    low: number;    // severity 1-2
    medium: number; // severity 3
    high: number;   // severity 4-5
  };
}

export type ProductFilter = 'All' | 'EDGE' | 'SiteLink' | 'Other';

/**
 * Aggregates themes across accounts with product filtering
 */
export function aggregateThemesByProduct(
  accounts: AccountWithMetrics[],
  productFilter: ProductFilter
): ThemeWithAccounts[] {
  // Filter accounts by product type
  const filteredAccounts = productFilter === 'All'
    ? accounts
    : accounts.filter(account => extractProductType(account.products) === productFilter);

  // Map to collect all themes from all accounts
  const themeMap = new Map<string, {
    theme_key: string;
    total_count: number;
    total_severity: number; // for calculating average
    accounts: Map<string, {
      id: string;
      name: string;
      count: number;
      total_severity: number;
    }>;
    severity_counts: {
      low: number;
      medium: number;
      high: number;
    };
  }>();

  // Process each account's themes
  for (const account of filteredAccounts) {
    const topThemes = account.current_snapshot?.top_themes;
    if (!topThemes || topThemes.length === 0) continue;

    for (const theme of topThemes) {
      let themeData = themeMap.get(theme.theme_key);

      if (!themeData) {
        themeData = {
          theme_key: theme.theme_key,
          total_count: 0,
          total_severity: 0,
          accounts: new Map(),
          severity_counts: { low: 0, medium: 0, high: 0 }
        };
        themeMap.set(theme.theme_key, themeData);
      }

      // Update theme totals
      themeData.total_count += theme.count;
      themeData.total_severity += theme.avg_severity * theme.count;

      // Update severity distribution
      if (theme.avg_severity < 3) {
        themeData.severity_counts.low += theme.count;
      } else if (theme.avg_severity < 4) {
        themeData.severity_counts.medium += theme.count;
      } else {
        themeData.severity_counts.high += theme.count;
      }

      // Track affected account
      let accountData = themeData.accounts.get(account.id);
      if (!accountData) {
        accountData = {
          id: account.id,
          name: account.name,
          count: 0,
          total_severity: 0
        };
        themeData.accounts.set(account.id, accountData);
      }

      accountData.count += theme.count;
      accountData.total_severity += theme.avg_severity * theme.count;
    }
  }

  // Convert map to array and calculate averages
  const themesWithAccounts: ThemeWithAccounts[] = [];
  const themeDataArray = Array.from(themeMap.values());

  for (const themeData of themeDataArray) {
    const affected_accounts = Array.from(themeData.accounts.values()).map(account => ({
      id: account.id,
      name: account.name,
      count: account.count,
      avg_severity: account.total_severity / account.count
    }));

    // Sort affected accounts by count * severity (impact)
    affected_accounts.sort((a, b) => {
      const impactA = a.count * a.avg_severity;
      const impactB = b.count * b.avg_severity;
      return impactB - impactA;
    });

    themesWithAccounts.push({
      theme_key: themeData.theme_key,
      theme_label: formatThemeLabel(themeData.theme_key),
      total_count: themeData.total_count,
      avg_severity: themeData.total_severity / themeData.total_count,
      affected_accounts,
      severity_distribution: themeData.severity_counts
    });
  }

  // Sort themes by impact (total_count * avg_severity)
  themesWithAccounts.sort((a, b) => {
    const impactA = a.total_count * a.avg_severity;
    const impactB = b.total_count * b.avg_severity;
    return impactB - impactA;
  });

  return themesWithAccounts;
}

/**
 * Gets the total number of friction issues for a product filter
 */
export function getTotalIssueCount(themes: ThemeWithAccounts[]): number {
  return themes.reduce((sum, theme) => sum + theme.total_count, 0);
}

/**
 * Gets the count of accounts with friction data for a product filter
 */
export function getAffectedAccountCount(accounts: AccountWithMetrics[], productFilter: ProductFilter): number {
  const filteredAccounts = productFilter === 'All'
    ? accounts
    : accounts.filter(account => extractProductType(account.products) === productFilter);

  return filteredAccounts.filter(account =>
    account.current_snapshot?.top_themes &&
    account.current_snapshot.top_themes.length > 0
  ).length;
}
