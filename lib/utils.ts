/**
 * Extracts the product type (EDGE vs SiteLink) from the account vertical field.
 * The vertical field stores product information as a string like "Software (EDGE)" or "Software (SiteLink)".
 *
 * @param vertical - The account vertical string
 * @returns Product type: 'EDGE', 'SiteLink', or 'Other'
 */
export function extractProductType(vertical: string | null): 'EDGE' | 'SiteLink' | 'Other' {
  if (!vertical) return 'Other';

  const upperVertical = vertical.toUpperCase();

  if (upperVertical.includes('EDGE')) return 'EDGE';
  if (upperVertical.includes('SITELINK')) return 'SiteLink';

  return 'Other';
}

/**
 * Formats a theme key into a human-readable label.
 * Example: "integration_failures" -> "Integration Failures"
 *
 * @param themeKey - The theme key string
 * @returns Formatted theme label
 */
export function formatThemeLabel(themeKey: string): string {
  return themeKey
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
