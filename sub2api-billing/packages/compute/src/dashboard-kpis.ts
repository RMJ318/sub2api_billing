/**
 * Dashboard Overview KPI computation (design "Aggregation and Compute Library",
 * Requirement 4).
 *
 * `computeDashboardKpis` derives the headline KPI_Card metrics for a selected
 * Billing_Month from that month's Monthly_Summary_Records, and — when the
 * preceding month's records are supplied — the per-KPI month-over-month
 * percentage change (Requirement 4.10).
 *
 * The function is pure and deterministic: it performs no I/O and depends only
 * on its arguments. Money is summed with `decimal.js` to preserve the
 * up-to-6-digit fractional precision in the source data (Requirements 2.3, 21);
 * counts are plain integers; the average response time is request-weighted.
 *
 * Every metric is total over the supplied records: a `null` numeric or money
 * field contributes its additive identity (`0`), matching the parser's
 * treatment of empty optional fields (Requirement 2.8) and keeping the
 * aggregates additive (design Properties 11-14).
 *
 * This is the source of truth for the Dashboard KPI row and the primary target
 * of design Properties 11, 12, 13, 14, and 15.
 */
import { Decimal } from 'decimal.js';

import { sumField, weightedAvg } from './aggregation.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * The month-over-month change for a single KPI_Card (Requirement 4.10).
 *
 * `comparable` is `true` together with the signed percentage change when the
 * preceding month's value for that KPI is non-zero. It is `false` — the
 * no-comparison indicator — when the preceding value is zero, since a relative
 * change against zero is undefined (Requirement 4.10, design Property 15).
 */
export type KpiChange = { comparable: true; changePct: number } | { comparable: false };

/**
 * Per-KPI month-over-month comparison against the preceding Billing_Month
 * (Requirement 4.10).
 *
 * Each field mirrors a KPI on {@link DashboardKpis} and carries that KPI's
 * change relative to the most recent earlier month, computed as
 * `(current - preceding) / preceding * 100`, or the no-comparison indicator
 * when the preceding value is zero.
 */
export interface KpiComparison {
  totalSpendUsd: KpiChange;
  activeUserCount: KpiChange;
  totalRequestCount: KpiChange;
  totalTokenCount: KpiChange;
  totalApiKeyCount: KpiChange;
  avgResponseMs: KpiChange;
  budgetUsageRatePct: KpiChange;
}

/**
 * The headline Dashboard KPI metrics for a single Billing_Month (Requirement 4.1).
 *
 * - `totalSpendUsd` — decimal sum of `used_usd` (Requirement 4.2).
 * - `activeUserCount` — distinct `user_id` with `request_count >= 1` (Requirement 4.3).
 * - `totalTokenCount` — sum of the five token fields (Requirement 4.4).
 * - `totalRequestCount` — sum of `request_count` (Requirement 4.5).
 * - `totalApiKeyCount` — sum of `api_key_count` (Requirement 4.6).
 * - `avgResponseMs` — request-weighted average of `avg_duration_ms` (Requirement 4.7).
 * - `budgetUsageRatePct` — `totalSpend / sum(monthly_limit_usd) * 100`, rounded
 *   to one decimal place, or `0` when the limit sum is zero (Requirements 4.8, 4.9).
 * - `comparison` — present only when preceding-month records are supplied
 *   (Requirement 4.10).
 */
export interface DashboardKpis {
  totalSpendUsd: Decimal;
  activeUserCount: number;
  totalRequestCount: number;
  totalTokenCount: number;
  totalApiKeyCount: number;
  avgResponseMs: number;
  budgetUsageRatePct: number;
  comparison?: KpiComparison;
}

/** The five token fields summed into the Dashboard's total token count (Req 4.4). */
function recordTokenCount(r: MonthlySummaryRecord): number {
  return (
    (r.input_tokens ?? 0) +
    (r.output_tokens ?? 0) +
    (r.cache_creation_tokens ?? 0) +
    (r.cache_read_tokens ?? 0) +
    (r.image_output_tokens ?? 0)
  );
}

/** Decimal `used_usd`, treating an empty (null) money field as `0` (Req 2.8). */
const pickUsed = (r: MonthlySummaryRecord): Decimal => r.used_usd ?? new Decimal(0);

/** Decimal `monthly_limit_usd`, treating an empty (null) money field as `0`. */
const pickLimit = (r: MonthlySummaryRecord): Decimal => r.monthly_limit_usd ?? new Decimal(0);

/**
 * Compute the KPI metrics for one month's records, without the comparison.
 *
 * Factored out so the same logic produces both the current-month KPIs and the
 * preceding-month KPIs that the comparison is derived from.
 */
function computeBaseKpis(records: readonly MonthlySummaryRecord[]): DashboardKpis {
  // Total Spend: decimal sum of used_usd (Req 4.2).
  const totalSpendUsd = sumField(records, pickUsed);

  // Active user count: distinct user_id whose request_count >= 1 (Req 4.3).
  const activeUsers = new Set<string>();
  for (const r of records) {
    if ((r.request_count ?? 0) >= 1) {
      activeUsers.add(r.user_id);
    }
  }

  // Total request count: sum of request_count (Req 4.5).
  let totalRequestCount = 0;
  // Total token count: sum of the five token fields (Req 4.4).
  let totalTokenCount = 0;
  // Total API key count: sum of api_key_count (Req 4.6).
  let totalApiKeyCount = 0;
  for (const r of records) {
    totalRequestCount += r.request_count ?? 0;
    totalTokenCount += recordTokenCount(r);
    totalApiKeyCount += r.api_key_count ?? 0;
  }

  // Average response time: request-weighted average of avg_duration_ms, 0 when
  // the total request count is 0 (Req 4.7).
  const avgResponseMs = weightedAvg(
    records,
    (r) => r.avg_duration_ms ?? 0,
    (r) => r.request_count ?? 0,
  );

  // Budget usage rate: totalSpend / sum(monthly_limit_usd) * 100, rounded to 1
  // decimal place; 0 when the limit sum is 0 (Req 4.8, 4.9).
  const limitSum = sumField(records, pickLimit);
  const budgetUsageRatePct = limitSum.isZero()
    ? 0
    : totalSpendUsd.div(limitSum).times(100).toDecimalPlaces(1).toNumber();

  return {
    totalSpendUsd,
    activeUserCount: activeUsers.size,
    totalRequestCount,
    totalTokenCount,
    totalApiKeyCount,
    avgResponseMs,
    budgetUsageRatePct,
  };
}

/** Percentage change between two `number` KPI values, or no-comparison at zero. */
function numberChange(current: number, preceding: number): KpiChange {
  if (preceding === 0) {
    return { comparable: false };
  }
  return { comparable: true, changePct: ((current - preceding) / preceding) * 100 };
}

/** Percentage change between two `Decimal` KPI values, or no-comparison at zero. */
function decimalChange(current: Decimal, preceding: Decimal): KpiChange {
  if (preceding.isZero()) {
    return { comparable: false };
  }
  return {
    comparable: true,
    changePct: current.minus(preceding).div(preceding).times(100).toNumber(),
  };
}

/** Build the per-KPI month-over-month comparison from two computed KPI sets. */
function buildComparison(current: DashboardKpis, preceding: DashboardKpis): KpiComparison {
  return {
    totalSpendUsd: decimalChange(current.totalSpendUsd, preceding.totalSpendUsd),
    activeUserCount: numberChange(current.activeUserCount, preceding.activeUserCount),
    totalRequestCount: numberChange(current.totalRequestCount, preceding.totalRequestCount),
    totalTokenCount: numberChange(current.totalTokenCount, preceding.totalTokenCount),
    totalApiKeyCount: numberChange(current.totalApiKeyCount, preceding.totalApiKeyCount),
    avgResponseMs: numberChange(current.avgResponseMs, preceding.avgResponseMs),
    budgetUsageRatePct: numberChange(current.budgetUsageRatePct, preceding.budgetUsageRatePct),
  };
}

/**
 * Compute the Dashboard Overview KPI metrics for a selected Billing_Month
 * (Requirement 4).
 *
 * Aggregates `current` (the selected month's Monthly_Summary_Records) into the
 * headline KPI_Card values. When `preceding` is supplied — i.e. more than one
 * Billing_Month is available and an earlier month exists (Requirement 4.10) —
 * the result also carries a per-KPI `comparison` giving each KPI's percentage
 * change relative to that preceding month, or the no-comparison indicator for a
 * KPI whose preceding value is zero.
 *
 * When `preceding` is omitted, no comparison is produced (a single month has no
 * earlier month to compare against).
 *
 * @param current - Monthly_Summary_Records for the selected Billing_Month.
 * @param preceding - Monthly_Summary_Records for the most recent earlier month,
 *   or `undefined` when no earlier month is available.
 * @returns The computed {@link DashboardKpis}, including `comparison` when
 *   `preceding` is provided.
 */
export function computeDashboardKpis(
  current: readonly MonthlySummaryRecord[],
  preceding?: readonly MonthlySummaryRecord[],
): DashboardKpis {
  const currentKpis = computeBaseKpis(current);
  if (preceding === undefined) {
    return currentKpis;
  }
  const precedingKpis = computeBaseKpis(preceding);
  return {
    ...currentKpis,
    comparison: buildComparison(currentKpis, precedingKpis),
  };
}
