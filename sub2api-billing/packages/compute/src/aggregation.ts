/**
 * Generic aggregation helpers (design "Aggregation and Compute Library").
 *
 * These are the small, reusable building blocks shared across the Dashboard,
 * User, Model, API Key, and Cost pages. They are pure, deterministic, and
 * side-effect free, and are the primary target of the property-based tests in
 * design Properties 13, 16, 18, and 19.
 *
 * Money is summed with `decimal.js` to preserve the up-to-6-digit fractional
 * precision in the source data (e.g. `433.930721`) and avoid float drift in
 * cost aggregates (Requirements 2.3, 21). Request-weighted averages operate on
 * plain `number` fields (`avg_duration_ms`, `request_count`).
 */
import { Decimal } from 'decimal.js';

/**
 * Decimal-safe sum of a chosen money field across rows (design helper
 * `sumField`).
 *
 * Accumulates `pick(row)` for every row using decimal arithmetic so summing
 * USD costs never drifts the way native floating point would. An empty input
 * yields `0` (the additive identity), which keeps callers total-preserving
 * (design Property 16) and matches the additive KPI aggregates in
 * Requirement 4.
 *
 * @typeParam T - The row type.
 * @param rows - The records to sum over.
 * @param pick - Selects the `Decimal` money value to add for a given row.
 * @returns The decimal sum of `pick(row)` over all rows; `new Decimal(0)` when
 *   `rows` is empty.
 */
export function sumField<T>(rows: readonly T[], pick: (r: T) => Decimal): Decimal {
  let total = new Decimal(0);
  for (const row of rows) {
    total = total.plus(pick(row));
  }
  return total;
}

/**
 * Request-weighted average of a numeric field (design helper `weightedAvg`,
 * Property 13).
 *
 * Computes `sum(value(row) * weight(row)) / sum(weight(row))`, the weighted
 * average formula used for the Dashboard's average response time over
 * Monthly_Summary_Records (Requirement 4.7) and a model's `avg_duration_ms`
 * over Model_Usage_Records (Requirement 11.5), where `weight` is the per-row
 * `request_count`.
 *
 * When the total weight is `0` (no requests, or an empty input) the average is
 * defined as `0` rather than producing a division-by-zero `NaN`, exactly as
 * the requirements specify.
 *
 * @typeParam T - The row type.
 * @param rows - The records to average over.
 * @param value - Selects the numeric value being averaged (e.g. `avg_duration_ms`).
 * @param weight - Selects the non-negative weight (e.g. `request_count`).
 * @returns The request-weighted average, or `0` when the total weight is `0`.
 */
export function weightedAvg<T>(
  rows: readonly T[],
  value: (r: T) => number,
  weight: (r: T) => number,
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const w = weight(row);
    weightedSum += value(row) * w;
    totalWeight += w;
  }
  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}

/**
 * Keyed group-sum of a money metric (design helper `groupSum`, Property 16).
 *
 * Groups rows by `key(row)` and sums `metric(row)` within each group using
 * decimal arithmetic. The result preserves the additive total: the sum of the
 * per-group totals equals the grand total of `metric` across all rows, and
 * each group's total equals the sum over its member rows. This backs the
 * Model_Family / model / API key / treemap groupings in Requirements 5.3,
 * 11.1-11.3, 12.1, and 13.4.
 *
 * Keys are compared by `Map` identity/equality (SameValueZero). Group entries
 * appear in first-seen insertion order.
 *
 * @typeParam T - The row type.
 * @typeParam K - The grouping key type.
 * @param rows - The records to group and sum.
 * @param key - Selects the grouping key for a row.
 * @param metric - Selects the `Decimal` money value to add for a row.
 * @returns A `Map` from key to the decimal sum of `metric` over that key's rows.
 */
export function groupSum<T, K>(
  rows: readonly T[],
  key: (r: T) => K,
  metric: (r: T) => Decimal,
): Map<K, Decimal> {
  const sums = new Map<K, Decimal>();
  for (const row of rows) {
    const k = key(row);
    const current = sums.get(k) ?? new Decimal(0);
    sums.set(k, current.plus(metric(row)));
  }
  return sums;
}

/**
 * Descending, bounded top-N ranking by a numeric metric (design helper `topN`,
 * Property 18).
 *
 * Returns the `n` highest-metric rows sorted by `metric` in descending order.
 * The result contains at most `n` entries, contains every row when fewer than
 * `n` exist, and selects the `n` highest-metric records. This drives the
 * top-10 user spend ranking (Requirement 5.2) and high-frequency key ranking
 * (Requirement 12.5).
 *
 * The input array is not mutated (a copy is sorted). A non-positive `n` yields
 * an empty result. The sort is stable, so rows with equal metrics keep their
 * original relative order.
 *
 * @typeParam T - The row type.
 * @param rows - The records to rank.
 * @param metric - Selects the numeric metric to rank by (higher ranks first).
 * @param n - The maximum number of rows to return.
 * @returns Up to `n` rows ordered by `metric` descending.
 */
export function topN<T>(rows: readonly T[], metric: (r: T) => number, n: number): T[] {
  if (n <= 0) {
    return [];
  }
  const sorted = [...rows].sort((a, b) => metric(b) - metric(a));
  return sorted.slice(0, n);
}

/**
 * Username-to-email display label fallback (design helper `displayLabel`,
 * Property 19).
 *
 * Returns the `username` when it is present, otherwise the `email`
 * (Requirements 5.2, 7.5). "Present" follows the platform's notion of empty
 * from Requirement 2.7 — a `null`, empty, or whitespace-only value is treated
 * as empty — so a user whose username is blank is labelled by their email. If
 * both are empty the label is the empty string, since the function always
 * returns a `string`.
 *
 * @param username - The user's username, or `null` when absent.
 * @param email - The user's email, or `null` when absent.
 * @returns The username when present, else the email when present, else `''`.
 */
export function displayLabel(username: string | null, email: string | null): string {
  if (username !== null && username.trim() !== '') {
    return username;
  }
  if (email !== null && email.trim() !== '') {
    return email;
  }
  return '';
}
