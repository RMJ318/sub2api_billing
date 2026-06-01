/**
 * Pareto concentration analysis (design "Aggregation and Compute Library",
 * Requirement 14.1, Property 28).
 *
 * The Cost Analysis page quantifies spend concentration by reporting the
 * percentage of total Spend contributed by the highest-spending users: the top
 * 10 percent, top 20 percent, and top 30 percent of users ranked by Spend
 * descending for the selected Billing_Month (Requirement 14.1).
 *
 * Spend stays as `decimal.js` `Decimal` on input to preserve the up-to-6-digit
 * fractional precision in the source money data and to avoid float drift while
 * summing and dividing; the shares are returned as plain `number` percentages
 * (0–100) for the chart/DTO layer.
 *
 * User-count cutoffs: the design fixes the percentile bands (10/20/30) but does
 * not state how a fractional user count is rounded. We use `Math.ceil`, the
 * standard Pareto convention, so a non-empty input always places at least one
 * user in each band and the displayed top-X% is never an empty, 0% slice. Ceil
 * is monotonic non-decreasing, so `count(10%) ≤ count(20%) ≤ count(30%)` and
 * therefore the cumulative shares satisfy `top10 ≤ top20 ≤ top30` (Property 28).
 */
import { Decimal } from 'decimal.js';

/**
 * Cumulative Spend shares held by the highest-spending users, as percentages of
 * total Spend (Requirement 14.1).
 *
 * Each field is the percentage (0–100) of total Spend contributed by the
 * corresponding top band of users, ranked by Spend descending. By construction
 * the shares are monotonic: `top10 ≤ top20 ≤ top30` (Property 28).
 */
export interface ParetoShares {
  /** Percent of total Spend held by the top 10% of users (by Spend, descending). */
  top10: number;
  /** Percent of total Spend held by the top 20% of users (by Spend, descending). */
  top20: number;
  /** Percent of total Spend held by the top 30% of users (by Spend, descending). */
  top30: number;
}

/** Percentile bands reported by the Pareto panel, as fractions of the user set. */
const BANDS = [0.1, 0.2, 0.3] as const;

/**
 * Compute the cumulative Spend shares for the top 10/20/30 percent of users
 * (Requirement 14.1, Property 28).
 *
 * Ranks the given per-user spends in descending order, then for each band sums
 * the spends of the top `ceil(band × userCount)` users and divides by the total
 * Spend to get that band's percentage of the whole. Because each band is a
 * prefix of the same descending ranking and (non-negative) spends only add to
 * the cumulative total, the result is monotonic — `top10 ≤ top20 ≤ top30` — and
 * each share lies in `[0, 100]` (Property 28).
 *
 * Edge cases:
 * - An empty input has no users and no Spend, so every share is `0`.
 * - When the total Spend is `0` (every user spent nothing) the shares are
 *   defined as `0` rather than a division-by-zero `NaN`.
 *
 * The input array is not mutated (a copy is sorted).
 *
 * @param spends - One Spend (`used_usd`) per user for the selected Billing_Month.
 * @returns The cumulative top-10/20/30-percent Spend shares as 0–100 percentages.
 */
export function paretoShares(spends: readonly Decimal[]): ParetoShares {
  const userCount = spends.length;
  if (userCount === 0) {
    return { top10: 0, top20: 0, top30: 0 };
  }

  // Rank by Spend descending; copy first so the caller's array is untouched.
  const ranked = [...spends].sort((a, b) => b.comparedTo(a));

  const total = ranked.reduce((acc, spend) => acc.plus(spend), new Decimal(0));
  if (total.isZero()) {
    return { top10: 0, top20: 0, top30: 0 };
  }

  // The per-band user-count cutoffs: at least one user, capped at the full set.
  const cutoffs = BANDS.map((band) => Math.min(Math.ceil(band * userCount), userCount));

  // Read each band's cumulative Spend from the descending ranking in a single
  // forward pass, capturing the running cumulative as we cross each cutoff.
  const cumulativeShares = new Array<number>(BANDS.length).fill(0);
  let cumulative = new Decimal(0);
  let rank = 0;
  for (const spend of ranked) {
    cumulative = cumulative.plus(spend);
    rank += 1;
    cutoffs.forEach((cutoff, band) => {
      if (rank === cutoff) {
        cumulativeShares[band] = cumulative.div(total).times(100).toNumber();
      }
    });
  }

  return {
    top10: cumulativeShares[0] ?? 0,
    top20: cumulativeShares[1] ?? 0,
    top30: cumulativeShares[2] ?? 0,
  };
}
