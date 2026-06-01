/**
 * Scatter dataset mapping (design "Aggregation and Compute Library", Property 26).
 *
 * Maps per-entity billing records to one scatter point each for the two scatter
 * visualizations in the spec:
 *
 * - User activity scatter (Requirements 8.1, 8.2): one point per user with
 *   request count on the X axis, Spend (`used_usd`) on the Y axis, and a point
 *   size proportional to the user's total token count, from
 *   Monthly_Summary_Records.
 * - Model efficiency scatter (Requirements 11.4, 11.5): one point per model
 *   with the request-count-weighted `avg_duration_ms` on the X axis and total
 *   Spend on the Y axis, from Model_Usage_Records aggregated by `model`.
 *
 * The point `size` is a monotonic non-decreasing function of the entity's total
 * token count (design Property 26): if one entity has at least as many total
 * tokens as another, its point is at least as large. The default mapping is the
 * identity, so `size` is directly proportional to total tokens (Requirement
 * 8.2); the rendering layer may apply its own monotonic visual scale.
 *
 * Money stays as `decimal.js` `Decimal` on the Y axis to preserve the up-to-
 * 6-digit fractional precision in the source data; DTO shaping to numbers
 * happens in the API layer.
 */
import { Decimal } from 'decimal.js';
import type { MonthlySummaryRecord, ModelUsageRecord } from './types/records.js';
import { displayLabel, sumField, weightedAvg } from './aggregation.js';

/**
 * One point in a scatter dataset: a single entity (user or model) plotted by
 * its defined X/Y axis metrics with a token-derived point size.
 */
export interface ScatterPoint {
  /** Stable entity identity: the `user_id` for users, the model name for models. */
  id: string;
  /** Human-readable label shown in tooltips (username→email for users, model name for models). */
  label: string;
  /** X-axis metric for the entity (e.g. request count, or weighted `avg_duration_ms`). */
  x: number;
  /** Y-axis metric for the entity: Spend in USD, kept as `Decimal` for precision. */
  y: Decimal;
  /** Point size — a monotonic non-decreasing function of `totalTokens` (Property 26). */
  size: number;
  /** The entity's total token count, surfaced for tooltips (Requirement 8.3). */
  totalTokens: number;
}

/**
 * Default point-size mapping: the identity over total token count.
 *
 * This is proportional to the total token count (Requirement 8.2) and is, by
 * construction, monotonic non-decreasing in total tokens (Property 26). Token
 * counts are non-negative integers, so sizes are non-negative.
 */
function defaultSizeFromTokens(totalTokens: number): number {
  return totalTokens;
}

/**
 * Sum of a Monthly_Summary_Record's token fields, treating missing values as 0.
 *
 * Uses the same five token fields as the Dashboard's total token count
 * (Requirement 4.4): input, output, cache-creation, cache-read, and image
 * output tokens.
 */
function monthlySummaryTotalTokens(r: MonthlySummaryRecord): number {
  return (
    (r.input_tokens ?? 0) +
    (r.output_tokens ?? 0) +
    (r.cache_creation_tokens ?? 0) +
    (r.cache_read_tokens ?? 0) +
    (r.image_output_tokens ?? 0)
  );
}

/**
 * Sum of a Model_Usage_Record's token fields, treating missing values as 0.
 */
function modelUsageTotalTokens(r: ModelUsageRecord): number {
  return (
    (r.input_tokens ?? 0) +
    (r.output_tokens ?? 0) +
    (r.cache_creation_tokens ?? 0) +
    (r.cache_read_tokens ?? 0) +
    (r.image_output_tokens ?? 0)
  );
}

/**
 * Map Monthly_Summary_Records to the user activity scatter dataset
 * (Requirements 8.1, 8.2; design Property 26).
 *
 * Produces exactly one point per input record (Monthly_Summary_Records are one
 * row per user per month, so this is one point per user) in input order. Each
 * point's X coordinate is the user's request count, its Y coordinate is the
 * user's Spend (`used_usd`), and its size is `sizeFromTokens` applied to the
 * user's total token count — proportional to total tokens by default and always
 * monotonic non-decreasing in total tokens. Missing numeric values are treated
 * as 0 and missing money as `0`.
 *
 * @param summaries - The selected month's Monthly_Summary_Records (one per user).
 * @param sizeFromTokens - Monotonic non-decreasing size mapping; defaults to the
 *   identity so size is proportional to total tokens.
 * @returns One `ScatterPoint` per record, in the same order as `summaries`.
 */
export function userActivityScatter(
  summaries: readonly MonthlySummaryRecord[],
  sizeFromTokens: (totalTokens: number) => number = defaultSizeFromTokens,
): ScatterPoint[] {
  return summaries.map((r) => {
    const totalTokens = monthlySummaryTotalTokens(r);
    return {
      id: r.user_id,
      label: displayLabel(r.username, r.email),
      x: r.request_count ?? 0,
      y: r.used_usd ?? new Decimal(0),
      size: sizeFromTokens(totalTokens),
      totalTokens,
    };
  });
}

/**
 * Map Model_Usage_Records to the model efficiency scatter dataset
 * (Requirements 11.4, 11.5; design Property 26).
 *
 * Aggregates records by `model` (Model_Usage_Records are one row per user per
 * model, so multiple rows can share a model) and emits exactly one point per
 * distinct model, in first-seen model order. Each point's X coordinate is the
 * request-count-weighted average of `avg_duration_ms` across that model's rows
 * (Requirement 11.5), its Y coordinate is the model's total Spend (sum of
 * `used_usd`), and its size is `sizeFromTokens` applied to the model's total
 * token count — proportional to total tokens by default and always monotonic
 * non-decreasing in total tokens. Missing numeric values are treated as 0 and
 * missing money as `0`.
 *
 * @param models - The selected month's Model_Usage_Records.
 * @param sizeFromTokens - Monotonic non-decreasing size mapping; defaults to the
 *   identity so size is proportional to total tokens.
 * @returns One `ScatterPoint` per distinct model, in first-seen order.
 */
export function modelEfficiencyScatter(
  models: readonly ModelUsageRecord[],
  sizeFromTokens: (totalTokens: number) => number = defaultSizeFromTokens,
): ScatterPoint[] {
  // Group by model, preserving first-seen insertion order (matches groupSum).
  const groups = new Map<string, ModelUsageRecord[]>();
  for (const r of models) {
    const existing = groups.get(r.model);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(r.model, [r]);
    }
  }

  const points: ScatterPoint[] = [];
  for (const [model, rows] of groups) {
    let totalTokens = 0;
    for (const r of rows) {
      totalTokens += modelUsageTotalTokens(r);
    }
    const y = sumField(rows, (r) => r.used_usd ?? new Decimal(0));
    const x = weightedAvg(
      rows,
      (r) => r.avg_duration_ms ?? 0,
      (r) => r.request_count ?? 0,
    );
    points.push({
      id: model,
      label: model,
      x,
      y,
      size: sizeFromTokens(totalTokens),
      totalTokens,
    });
  }
  return points;
}
