/**
 * Priority Score Calculation for Visit Planner
 *
 * Formula: Priority = (Revenue × 0.40) + (Friction × 0.35) + (Proximity × 0.25)
 *
 * Each component is normalized to 0-100 scale before applying weights.
 */

export interface AccountForScoring {
  arr: number | null;
  ofi_score: number | null;
  distance_miles: number;
}

export interface ScoringOptions {
  maxDistance: number; // Search radius in miles (for normalization)
  maxArr: number; // Portfolio max ARR (for normalization)
}

/**
 * Calculate priority score for an account based on revenue, friction, and distance
 *
 * @param account - Account with arr, ofi_score, and distance_miles
 * @param options - Scoring options with maxDistance and maxArr for normalization
 * @returns Priority score (0-100)
 */
export function calculatePriorityScore(
  account: AccountForScoring,
  options: ScoringOptions
): number {
  // 1. Revenue Score (0-100)
  // Normalize ARR against portfolio max, default to 50 if ARR is null
  const revenueScore = account.arr
    ? Math.min((account.arr / options.maxArr) * 100, 100)
    : 50; // Mid-range score for accounts with no ARR data

  // 2. Friction Score (0-100)
  // OFI score is already 0-100, use as-is. Default to 0 if no friction data
  const frictionScore = account.ofi_score || 0;

  // 3. Proximity Score (0-100, inverse of distance)
  // Closer = higher score. Distance 0 = 100, distance = maxDistance = 0
  const proximityScore = Math.max(
    0,
    Math.min(100, 100 * (1 - account.distance_miles / options.maxDistance))
  );

  // 4. Apply Weights and Calculate Final Priority
  // Revenue: 40%, Friction: 35%, Proximity: 25%
  const priority = (revenueScore * 0.40) + (frictionScore * 0.35) + (proximityScore * 0.25);

  return Math.round(priority);
}

/**
 * Calculate priority scores for multiple accounts
 *
 * @param accounts - Array of accounts with arr, ofi_score, and distance_miles
 * @param options - Scoring options with maxDistance and maxArr
 * @returns Array of accounts with priority_score added
 */
export function calculatePriorityScores<T extends AccountForScoring>(
  accounts: T[],
  options: ScoringOptions
): Array<T & { priority_score: number }> {
  return accounts.map(account => ({
    ...account,
    priority_score: calculatePriorityScore(account, options),
  }));
}

/**
 * Get the maximum ARR from an array of accounts for normalization
 *
 * @param accounts - Array of accounts with arr field
 * @returns Maximum ARR value, or 1000000 (1M) as fallback
 */
export function getMaxArr(accounts: Array<{ arr: number | null }>): number {
  const validArrs = accounts.map(a => a.arr).filter((arr): arr is number => arr !== null);
  return validArrs.length > 0 ? Math.max(...validArrs) : 1000000; // Default to 1M
}

/**
 * Sort accounts by priority score (descending)
 *
 * @param accounts - Array of accounts with priority_score
 * @returns Sorted array (high priority first)
 */
export function sortByPriority<T extends { priority_score: number }>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => b.priority_score - a.priority_score);
}

/**
 * Example usage:
 *
 * ```typescript
 * const accounts = [
 *   { id: '1', arr: 500000, ofi_score: 75, distance_miles: 10 },
 *   { id: '2', arr: 200000, ofi_score: 45, distance_miles: 25 },
 * ];
 *
 * const maxArr = getMaxArr(accounts);
 * const scored = calculatePriorityScores(accounts, {
 *   maxDistance: 50,
 *   maxArr
 * });
 *
 * const sorted = sortByPriority(scored);
 * ```
 */
