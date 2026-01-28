/**
 * Extracts the product type (EDGE vs SiteLink) from the account products field.
 * The products field stores product information as a string like "Software (EDGE)" or "Software (SiteLink)".
 *
 * @param products - The account products string
 * @returns Product type: 'EDGE', 'SiteLink', or 'Other'
 */
export function extractProductType(products: string | null): 'EDGE' | 'SiteLink' | 'Other' {
  if (!products) return 'Other';

  const upperProducts = products.toUpperCase();

  if (upperProducts.includes('EDGE')) return 'EDGE';
  if (upperProducts.includes('SITELINK')) return 'SiteLink';

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
