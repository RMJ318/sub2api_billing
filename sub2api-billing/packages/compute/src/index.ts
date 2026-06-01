/**
 * @core/compute - pure, deterministic analytical core.
 *
 * This package will hold CSV codecs, model-family classification, aggregation,
 * KPI math, budget/Pareto/forecast logic, key health, the insight and signal
 * engines, and CSV serialization. All functions here are side-effect free and
 * are the primary target of property-based testing (see design Properties 1-43).
 *
 * Implemented incrementally by subsequent tasks; this entry point is the public
 * surface other packages import from.
 */

/** Package identifier, used as a build/wiring smoke check. */
export const COMPUTE_PACKAGE = '@core/compute' as const;

// Shared normalized record types, enums, and DTOs (design "Data Models").
export * from './types/index.js';

// Model-family classification (Requirement 6): the single shared classifier
// used by the Dashboard, Model Analysis, and Cost Analysis pages.
export { classifyModelFamily } from './classify-model-family.js';

// CSV field codecs (Requirement 2.3-2.8): pure per-field converters used by the
// row parser and serializer.
export { moneyUsd, tokenCount, timestampTz, streamBool, text } from './codecs/index.js';

// Generic aggregation helpers (Requirements 4.7, 5.2, 7.5, 11.5, 12.5): the
// decimal-safe sum, request-weighted average, keyed group-sum, bounded top-N,
// and username->email display fallback reused across pages.
export { sumField, weightedAvg, groupSum, topN, displayLabel } from './aggregation.js';

// Dashboard Overview KPI computation (Requirement 4): headline KPI_Card metrics
// for a Billing_Month plus the per-KPI month-over-month comparison.
export { computeDashboardKpis } from './dashboard-kpis.js';
export type { DashboardKpis, KpiComparison, KpiChange } from './dashboard-kpis.js';

// Sorting, search, and date-range helpers (Requirements 3.5, 7.2, 7.3, 9.4,
// 19.2, 19.3): stable column sort, case-insensitive username/email search,
// inclusive date-range filter, and date-range validation.
export {
  compareValues,
  stableSortBy,
  matchesUserSearch,
  searchByText,
  isValidDateRange,
  filterByDateRange,
} from './query-helpers.js';
export type { SortValue, UserSearchFields } from './query-helpers.js';

// Scatter dataset mapping (Requirements 8.1, 8.2, 11.4): one point per entity
// (user/model) with defined X/Y axis metrics and a token-count-monotonic size.
export { userActivityScatter, modelEfficiencyScatter } from './scatter.js';
export type { ScatterPoint } from './scatter.js';

// Budget monitoring (Requirements 9, 4.8, 9.2, 9.3): a user's Usage_Percent and
// the progress-bar style band (normal/warning/critical) for that percentage.
export { usagePercent, budgetStyle } from './budget.js';
export type { BudgetStyle } from './budget.js';

// Pareto concentration analysis (Requirement 14.1): the cumulative Spend shares
// held by the top 10/20/30 percent of users ranked by Spend descending.
export { paretoShares } from './pareto.js';
export type { ParetoShares } from './pareto.js';

// Time-bucketed trend aggregation (Requirements 5.1, 10.1, 12.2, 12.3, 13.1,
// 13.2, 13.3): one ascending point per occupied daily/weekly/monthly bucket,
// summing a chosen metric, including pre-filtered single-user/single-key series.
export { aggregateTrend } from './trend.js';
export type { TrendGranularity, TrendPoint, TrendOptions } from './trend.js';

// CSV row parser, validator, and per-record-type schemas (Requirements 2.1,
// 2.2, 2.9, 2.10, 2.11): map columns by header name, split via csv-parse
// (RFC 4180), apply per-column codecs, enforce required fields per record type,
// and on any failure evaluate all remaining fields then reject the row.
export { parseCsv, parseRow, numeric } from './parser/index.js';
export type { ParseFileResult, ColumnSchema, RecordSchema, RecordType } from './parser/index.js';
export {
  monthlySummarySchema,
  dailyUsageSchema,
  modelUsageSchema,
  keyUsageSchema,
  requestDetailSchema,
  RECORD_SCHEMAS,
} from './parser/index.js';

// Month-end cost forecast (Requirements 14.2, 14.3, 14.4, 14.5): project the
// month-end Spend from the observed daily run rate, the days until the aggregate
// budget is reached, and the over-budget flag, or InsufficientData below 3 days.
export { forecastMonthEnd } from './forecast.js';
