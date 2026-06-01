/**
 * User budget monitoring math (design "Aggregation and Compute Library",
 * Requirement 9, 4.8).
 *
 * Two pure, deterministic helpers back the User_Analysis_Page budget monitoring
 * list:
 *
 * - {@link usagePercent} computes a single user's Usage_Percent — the ratio of
 *   their `used_usd` to their `monthly_limit_usd`, expressed as a percentage.
 * - {@link budgetStyle} maps a Usage_Percent to the progress-bar style band
 *   used to surface budget risk.
 *
 * Money is handled with `decimal.js` to preserve the up-to-6-digit fractional
 * precision in the source data (Requirements 2.3, 21). The functions perform no
 * I/O and depend only on their arguments.
 *
 * {@link budgetStyle} is the source of truth for the budget progress-bar styling
 * and the target of design Property 27.
 */
import type { Decimal } from 'decimal.js';

/**
 * The progress-bar style band for a user's budget usage (Requirements 9.2, 9.3).
 *
 * - `normal` — Usage_Percent below 80.
 * - `warning` — Usage_Percent in the half-open interval [80, 95) (yellow).
 * - `critical` — Usage_Percent at 95 or above (red).
 */
export type BudgetStyle = 'normal' | 'warning' | 'critical';

/**
 * Compute a user's Usage_Percent: `usedUsd / limitUsd * 100` (Requirement 9, 4.8).
 *
 * The result is the percentage of the user's Monthly_Budget_Limit they have
 * spent. When `limitUsd` is zero there is no limit to measure against, so the
 * Usage_Percent is `0` — mirroring the Dashboard's treatment of a zero limit
 * sum (Requirement 4.9).
 *
 * Money divides with `decimal.js` for precision; the percentage is returned as
 * a plain `number` for downstream styling and sorting (Requirement 9.4).
 *
 * @param usedUsd - The user's spend (`used_usd`).
 * @param limitUsd - The user's Monthly_Budget_Limit (`monthly_limit_usd`).
 * @returns The Usage_Percent, or `0` when `limitUsd` is zero.
 */
export function usagePercent(usedUsd: Decimal, limitUsd: Decimal): number {
  if (limitUsd.isZero()) {
    return 0;
  }
  return usedUsd.div(limitUsd).times(100).toNumber();
}

/**
 * Map a Usage_Percent to its budget progress-bar style (Requirements 9.2, 9.3).
 *
 * The bands are: `normal` below 80, `warning` on the half-open interval
 * [80, 95), and `critical` at 95 or above.
 *
 * @param usagePct - A Usage_Percent value (e.g. from {@link usagePercent}).
 * @returns The {@link BudgetStyle} band for that Usage_Percent.
 */
export function budgetStyle(usagePct: number): BudgetStyle {
  if (usagePct >= 95) {
    return 'critical';
  }
  if (usagePct >= 80) {
    return 'warning';
  }
  return 'normal';
}
