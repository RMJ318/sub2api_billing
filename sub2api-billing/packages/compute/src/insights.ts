/**
 * Insight Engine (design "Insight Engine", Requirement 15).
 *
 * Pure, deterministic functions that derive narrative trend insights and
 * top-performer rankings from aggregated Monthly_Summary_Records. These
 * provide the "management cockpit" experience described in the requirements:
 * the platform auto-generates short textual statements accompanied by
 * supporting metric values rather than only displaying raw numbers.
 *
 * - `topPerformers` ranks users by Spend, request count, and token count,
 *   returning the top user for each metric. Returns `null` when all users
 *   are zero across all three metrics (Requirement 15.2).
 *
 * - `trendInsights` compares the current month's totals against the preceding
 *   month's totals for Spend, active users, and total requests, producing a
 *   short text insight and its supporting numeric value (Requirements 15.3,
 *   15.4). Omits (rather than placeholders) insights when inputs are
 *   unavailable (Requirement 15.5).
 */
import { Decimal } from 'decimal.js';

import { displayLabel, sumField } from './aggregation.js';
import type { MonthlySummaryRecord } from './types/records.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single auto-generated insight (Requirement 15.4).
 * Each insight is a short textual statement accompanied by a supporting metric.
 */
export interface Insight {
  id: string;
  text: string;
  metricValue: number | string;
  kind: 'top_performer' | 'trend';
}

/**
 * The top performing user for a single metric dimension.
 */
export interface TopPerformerEntry {
  userId: string;
  label: string;
  value: number | string;
}

/**
 * Top performer rankings across Spend, requests, and tokens (Requirement 15.1).
 * Each field is the top-ranked user for that metric, or `null` when every user
 * has zero for that metric.
 */
export interface TopPerformerRanking {
  bySpend: TopPerformerEntry | null;
  byRequests: TopPerformerEntry | null;
  byTokens: TopPerformerEntry | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// topPerformers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Total token count for a single record (same definition as dashboard KPIs).
 */
function recordTokenCount(r: MonthlySummaryRecord): number {
  return (
    (r.input_tokens ?? 0) +
    (r.output_tokens ?? 0) +
    (r.cache_creation_tokens ?? 0) +
    (r.cache_read_tokens ?? 0) +
    (r.image_output_tokens ?? 0)
  );
}

/**
 * Produce a ranked list of the top performing users by Spend, request count,
 * and token count for a given month's summaries (Requirements 15.1, 15.2).
 *
 * Returns `null` when every user has zero Spend, zero requests, AND zero tokens
 * (Requirement 15.2 — all three metrics must be zero across all users to omit).
 *
 * For each metric, the ranking entry is `null` when all users have zero for
 * that specific metric. This provides per-metric nullability as specified by
 * the task description.
 *
 * @param summaries - Monthly_Summary_Records for the selected Billing_Month.
 * @returns Top performer rankings, or `null` when all metrics are universally zero.
 */
export function topPerformers(
  summaries: readonly MonthlySummaryRecord[],
): TopPerformerRanking | null {
  if (summaries.length === 0) {
    return null;
  }

  // Find the top user for each metric
  let topSpendRecord: MonthlySummaryRecord | null = null;
  let topSpendValue = new Decimal(0);

  let topRequestsRecord: MonthlySummaryRecord | null = null;
  let topRequestsValue = 0;

  let topTokensRecord: MonthlySummaryRecord | null = null;
  let topTokensValue = 0;

  for (const r of summaries) {
    const spend = r.used_usd ?? new Decimal(0);
    if (spend.gt(topSpendValue)) {
      topSpendValue = spend;
      topSpendRecord = r;
    }

    const requests = r.request_count ?? 0;
    if (requests > topRequestsValue) {
      topRequestsValue = requests;
      topRequestsRecord = r;
    }

    const tokens = recordTokenCount(r);
    if (tokens > topTokensValue) {
      topTokensValue = tokens;
      topTokensRecord = r;
    }
  }

  // If every metric across all users is zero, return null (Req 15.2)
  if (topSpendValue.isZero() && topRequestsValue === 0 && topTokensValue === 0) {
    return null;
  }

  // Build per-metric entries, null when that metric is all-zero
  const bySpend: TopPerformerEntry | null = topSpendRecord && !topSpendValue.isZero()
    ? {
        userId: topSpendRecord.user_id,
        label: displayLabel(topSpendRecord.username, topSpendRecord.email),
        value: topSpendValue.toString(),
      }
    : null;

  const byRequests: TopPerformerEntry | null = topRequestsRecord && topRequestsValue > 0
    ? {
        userId: topRequestsRecord.user_id,
        label: displayLabel(topRequestsRecord.username, topRequestsRecord.email),
        value: topRequestsValue,
      }
    : null;

  const byTokens: TopPerformerEntry | null = topTokensRecord && topTokensValue > 0
    ? {
        userId: topTokensRecord.user_id,
        label: displayLabel(topTokensRecord.username, topTokensRecord.email),
        value: topTokensValue,
      }
    : null;

  return { bySpend, byRequests, byTokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// trendInsights
// ─────────────────────────────────────────────────────────────────────────────

/** Decimal `used_usd`, treating an empty (null) money field as `0`. */
const pickUsed = (r: MonthlySummaryRecord): Decimal => r.used_usd ?? new Decimal(0);

/**
 * Compute percentage change between two numbers. Returns `null` when the
 * preceding value is zero (cannot compute relative change).
 */
function pctChange(current: number, preceding: number): number | null {
  if (preceding === 0) return null;
  return ((current - preceding) / preceding) * 100;
}

/**
 * Compute percentage change between two Decimal values. Returns `null` when the
 * preceding value is zero (cannot compute relative change).
 */
function pctChangeDecimal(current: Decimal, preceding: Decimal): number | null {
  if (preceding.isZero()) return null;
  return current.minus(preceding).div(preceding).times(100).toNumber();
}

/**
 * Generate a short directional text for a trend insight.
 */
function trendText(metric: string, changePct: number): string {
  const direction = changePct >= 0 ? 'increased' : 'decreased';
  const magnitude = Math.abs(Math.round(changePct * 10) / 10);
  return `${metric} ${direction} by ${magnitude}%`;
}

/**
 * Generate trend insights comparing the current month against the preceding
 * month for total Spend, active users, and total requests (Requirements 15.3,
 * 15.4, 15.5).
 *
 * Each insight is presented as a short textual statement describing the
 * direction and magnitude of change, accompanied by the supporting metric
 * value (Requirement 15.4).
 *
 * Insights are omitted (not placeholders) when:
 * - The preceding month records are empty (no preceding month available)
 * - The preceding value for a metric is zero (relative change is undefined)
 *
 * This satisfies Requirement 15.5: unavailable data → omit rather than placeholder.
 *
 * @param current - Monthly_Summary_Records for the selected Billing_Month.
 * @param preceding - Monthly_Summary_Records for the preceding Billing_Month.
 * @returns An array of trend insights (may be empty when data is unavailable).
 */
export function trendInsights(
  current: readonly MonthlySummaryRecord[],
  preceding: readonly MonthlySummaryRecord[],
): Insight[] {
  // If either dataset is empty, we cannot compute meaningful trends (Req 15.5)
  if (current.length === 0 || preceding.length === 0) {
    return [];
  }

  const insights: Insight[] = [];

  // --- Total Spend ---
  const currentSpend = sumField(current, pickUsed);
  const precedingSpend = sumField(preceding, pickUsed);
  const spendChange = pctChangeDecimal(currentSpend, precedingSpend);
  if (spendChange !== null) {
    insights.push({
      id: 'trend_spend',
      text: trendText('Total spend', spendChange),
      metricValue: currentSpend.toString(),
      kind: 'trend',
    });
  }

  // --- Active Users ---
  const currentActiveUsers = new Set<string>();
  for (const r of current) {
    if ((r.request_count ?? 0) >= 1) currentActiveUsers.add(r.user_id);
  }
  const precedingActiveUsers = new Set<string>();
  for (const r of preceding) {
    if ((r.request_count ?? 0) >= 1) precedingActiveUsers.add(r.user_id);
  }
  const activeChange = pctChange(currentActiveUsers.size, precedingActiveUsers.size);
  if (activeChange !== null) {
    insights.push({
      id: 'trend_active_users',
      text: trendText('Active users', activeChange),
      metricValue: currentActiveUsers.size,
      kind: 'trend',
    });
  }

  // --- Total Requests ---
  let currentRequests = 0;
  for (const r of current) {
    currentRequests += r.request_count ?? 0;
  }
  let precedingRequests = 0;
  for (const r of preceding) {
    precedingRequests += r.request_count ?? 0;
  }
  const requestsChange = pctChange(currentRequests, precedingRequests);
  if (requestsChange !== null) {
    insights.push({
      id: 'trend_requests',
      text: trendText('Total requests', requestsChange),
      metricValue: currentRequests,
      kind: 'trend',
    });
  }

  return insights;
}
