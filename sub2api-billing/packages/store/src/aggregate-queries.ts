/**
 * Aggregate query functions for all pages (Task 17.6).
 *
 * This is the query service layer between the in-memory record store and the
 * API. It wires the pure compute library to serve dashboard KPIs/charts,
 * user/model/key/cost aggregates, insights, and signals from the summary record
 * sets and server-side aggregation — never a full client load of `request_detail`.
 *
 * All money is summed in USD with no currency conversion (Decimal as-is).
 *
 * Requirements: 3.6, 13.2, 13.3, 21.4
 */
import { Decimal } from 'decimal.js';
import type { InMemoryRecordStore } from './record-store.js';
import {
  // Dashboard KPIs
  computeDashboardKpis,
  type DashboardKpis,

  // Aggregation helpers
  sumField,
  groupSum,
  topN,
  displayLabel,
  weightedAvg,

  // Trend
  aggregateTrend,
  type TrendGranularity,
  type TrendPoint,

  // Scatter
  userActivityScatter,
  modelEfficiencyScatter,
  type ScatterPoint,

  // Budget
  usagePercent,
  budgetStyle,
  type BudgetStyle,

  // Pareto
  paretoShares,
  type ParetoShares,

  // Forecast
  forecastMonthEnd,

  // Key health
  classifyKeyHealth,
  type KeyHealth,

  // Insights
  topPerformers,
  trendInsights,
  type Insight,
  type TopPerformerRanking,

  // Signals
  detectSignals,
  unreadCount,

  // Model classification
  classifyModelFamily,

  // Types
  type MonthlySummaryRecord,
  type DailyUsageRecord,
  type ModelUsageRecord,
  type KeyUsageRecord,
  type ForecastResult,
  type InsufficientData,
  type Signal,
  type ModelFamily,
} from '@core/compute';


// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Aggregates
// ─────────────────────────────────────────────────────────────────────────────

/** Dashboard daily trend metric selectors. */
type DailyMetric = 'spend' | 'requests' | 'tokens';

/** One trend point serialized for the API (value as string for Decimal precision). */
export interface TrendPointDto {
  bucket: string;
  value: string;
}

/** Dashboard aggregates returned to the API layer. */
export interface DashboardAggregates {
  kpis: DashboardKpis;
  dailyTrends: Record<DailyMetric, TrendPointDto[]>;
  topUserSpend: Array<{ label: string; userId: string; spend: string }>;
  modelFamilyShare: Record<ModelFamily, string>;
  costComposition: {
    input: string;
    output: string;
    cacheCreation: string;
    cacheRead: string;
    imageOutput: string;
  };
}

/**
 * Compute all Dashboard page aggregates for a selected Billing_Month.
 *
 * Sources: Monthly_Summary_Records and Daily_Usage_Records (never request_detail).
 * Requirements: 3.6, 4.1–4.10, 5.1–5.4
 */
export function getDashboardAggregates(
  store: InMemoryRecordStore,
  month: string,
): DashboardAggregates {
  const summaries = store.monthlySummaries(month);
  const daily = store.dailyUsage(month);
  const months = store.availableMonths();
  const monthIdx = months.indexOf(month);
  const precedingMonth = monthIdx > 0 ? months[monthIdx - 1]! : undefined;
  const preceding = precedingMonth ? store.monthlySummaries(precedingMonth) : undefined;

  // KPIs (Req 4)
  const kpis = computeDashboardKpis(summaries, preceding);

  // Daily trends (Req 5.1): spend, requests, tokens by usage_date
  const spendTrend = aggregateTrend(daily, {
    granularity: 'daily',
    date: (r) => r.usage_date,
    metric: (r) => r.used_usd ?? new Decimal(0),
  });
  const requestsTrend = aggregateTrend(daily, {
    granularity: 'daily',
    date: (r) => r.usage_date,
    metric: (r) => new Decimal(r.request_count ?? 0),
  });
  const tokensTrend = aggregateTrend(daily, {
    granularity: 'daily',
    date: (r) => r.usage_date,
    metric: (r) =>
      new Decimal(
        (r.input_tokens ?? 0) +
          (r.output_tokens ?? 0) +
          (r.cache_read_tokens ?? 0) +
          (r.image_output_tokens ?? 0),
      ),
  });

  // Top 10 user spend ranking (Req 5.2)
  const top10 = topN(summaries, (r) => (r.used_usd ?? new Decimal(0)).toNumber(), 10);
  const topUserSpend = top10.map((r) => ({
    label: displayLabel(r.username, r.email),
    userId: r.user_id,
    spend: (r.used_usd ?? new Decimal(0)).toString(),
  }));

  // Model family share (Req 5.3) from Model_Usage_Records
  const modelRecords = store.modelUsage(month);
  const familySpend = groupSum(
    modelRecords,
    (r) => classifyModelFamily(r.model),
    (r) => r.used_usd ?? new Decimal(0),
  );
  const modelFamilyShare: Record<ModelFamily, string> = {
    GPT: (familySpend.get('GPT') ?? new Decimal(0)).toString(),
    Claude: (familySpend.get('Claude') ?? new Decimal(0)).toString(),
    Gemini: (familySpend.get('Gemini') ?? new Decimal(0)).toString(),
    Other: (familySpend.get('Other') ?? new Decimal(0)).toString(),
  };

  // Cost composition (Req 5.4)
  const costComposition = {
    input: sumField(summaries, (r) => r.input_cost_usd ?? new Decimal(0)).toString(),
    output: sumField(summaries, (r) => r.output_cost_usd ?? new Decimal(0)).toString(),
    cacheCreation: sumField(summaries, (r) => r.cache_creation_cost_usd ?? new Decimal(0)).toString(),
    cacheRead: sumField(summaries, (r) => r.cache_read_cost_usd ?? new Decimal(0)).toString(),
    imageOutput: sumField(summaries, (r) => r.image_output_cost_usd ?? new Decimal(0)).toString(),
  };

  return {
    kpis,
    dailyTrends: {
      spend: toTrendDto(spendTrend),
      requests: toTrendDto(requestsTrend),
      tokens: toTrendDto(tokensTrend),
    },
    topUserSpend,
    modelFamilyShare,
    costComposition,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// User Analysis Aggregates
// ─────────────────────────────────────────────────────────────────────────────

/** A user's budget status for the budget monitor list. */
export interface UserBudgetEntry {
  userId: string;
  label: string;
  usedUsd: string;
  limitUsd: string;
  remainingUsd: string;
  usagePct: number;
  style: BudgetStyle;
}

/** User page aggregates returned to the API layer. */
export interface UserAggregates {
  rankings: Array<{
    userId: string;
    label: string;
    spend: string;
    requestCount: number;
    totalTokens: number;
    apiKeyCount: number;
  }>;
  activityScatter: ScatterPoint[];
  budgetMonitor: UserBudgetEntry[];
}

/**
 * Compute User Analysis page aggregates for a selected Billing_Month.
 *
 * Sources: Monthly_Summary_Records (never request_detail).
 * Requirements: 3.6, 7.1, 8.1, 8.2, 9.1–9.4
 */
export function getUserAggregates(
  store: InMemoryRecordStore,
  month: string,
): UserAggregates {
  const summaries = store.monthlySummaries(month);

  // User ranking table data (Req 7.1)
  const rankings = summaries.map((r) => ({
    userId: r.user_id,
    label: displayLabel(r.username, r.email),
    spend: (r.used_usd ?? new Decimal(0)).toString(),
    requestCount: r.request_count ?? 0,
    totalTokens:
      (r.input_tokens ?? 0) +
      (r.output_tokens ?? 0) +
      (r.cache_creation_tokens ?? 0) +
      (r.cache_read_tokens ?? 0) +
      (r.image_output_tokens ?? 0),
    apiKeyCount: r.api_key_count ?? 0,
  }));

  // Activity scatter (Req 8.1, 8.2)
  const activityScatter = userActivityScatter(summaries);

  // Budget monitor list sorted by Usage_Percent descending (Req 9.1–9.4)
  const budgetMonitor: UserBudgetEntry[] = summaries
    .map((r) => {
      const used = r.used_usd ?? new Decimal(0);
      const limit = r.monthly_limit_usd ?? new Decimal(0);
      const remaining = r.remaining_monthly_limit_usd ?? new Decimal(0);
      const pct = usagePercent(used, limit);
      return {
        userId: r.user_id,
        label: displayLabel(r.username, r.email),
        usedUsd: used.toString(),
        limitUsd: limit.toString(),
        remainingUsd: remaining.toString(),
        usagePct: pct,
        style: budgetStyle(pct),
      };
    })
    .sort((a, b) => b.usagePct - a.usagePct);

  return { rankings, activityScatter, budgetMonitor };
}

/** Per-user daily trend data. */
export interface UserTrendData {
  spend: TrendPointDto[];
  requests: TrendPointDto[];
  tokens: TrendPointDto[];
}

/**
 * Compute per-user daily trends for the User Analysis page (Req 10.1).
 *
 * Sources: Daily_Usage_Records filtered to a single user_id.
 */
export function getUserTrend(
  store: InMemoryRecordStore,
  month: string,
  userId: string,
): UserTrendData {
  const daily = store.dailyUsage(month).filter((r) => r.user_id === userId);

  const spend = aggregateTrend(daily, {
    granularity: 'daily',
    date: (r) => r.usage_date,
    metric: (r) => r.used_usd ?? new Decimal(0),
  });
  const requests = aggregateTrend(daily, {
    granularity: 'daily',
    date: (r) => r.usage_date,
    metric: (r) => new Decimal(r.request_count ?? 0),
  });
  const tokens = aggregateTrend(daily, {
    granularity: 'daily',
    date: (r) => r.usage_date,
    metric: (r) =>
      new Decimal(
        (r.input_tokens ?? 0) +
          (r.output_tokens ?? 0) +
          (r.cache_read_tokens ?? 0) +
          (r.image_output_tokens ?? 0),
      ),
  });

  return {
    spend: toTrendDto(spend),
    requests: toTrendDto(requests),
    tokens: toTrendDto(tokens),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Analysis Aggregates
// ─────────────────────────────────────────────────────────────────────────────

/** Model page aggregates returned to the API layer. */
export interface ModelAggregates {
  spendRanking: Array<{ model: string; spend: string }>;
  requestRanking: Array<{ model: string; requestCount: number }>;
  tokenStacks: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  }>;
  efficiencyScatter: ScatterPoint[];
}

/**
 * Compute Model Analysis page aggregates for a selected Billing_Month.
 *
 * Sources: Model_Usage_Records (never request_detail).
 * Requirements: 3.6, 11.1–11.5
 */
export function getModelAggregates(
  store: InMemoryRecordStore,
  month: string,
): ModelAggregates {
  const models = store.modelUsage(month);

  // Spend ranking by model (Req 11.1): group by model, sum used_usd, sort desc
  const spendByModel = groupSum(
    models,
    (r) => r.model,
    (r) => r.used_usd ?? new Decimal(0),
  );
  const spendRanking = [...spendByModel.entries()]
    .sort(([, a], [, b]) => b.comparedTo(a))
    .map(([model, spend]) => ({ model, spend: spend.toString() }));

  // Request count ranking by model (Req 11.2)
  const requestsByModel = new Map<string, number>();
  for (const r of models) {
    const current = requestsByModel.get(r.model) ?? 0;
    requestsByModel.set(r.model, current + (r.request_count ?? 0));
  }
  const requestRanking = [...requestsByModel.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([model, requestCount]) => ({ model, requestCount }));

  // Token stacks per model (Req 11.3)
  const tokenMap = new Map<string, { input: number; output: number; cacheRead: number }>();
  for (const r of models) {
    const existing = tokenMap.get(r.model) ?? { input: 0, output: 0, cacheRead: 0 };
    existing.input += r.input_tokens ?? 0;
    existing.output += r.output_tokens ?? 0;
    existing.cacheRead += r.cache_read_tokens ?? 0;
    tokenMap.set(r.model, existing);
  }
  const tokenStacks = [...tokenMap.entries()].map(([model, t]) => ({
    model,
    inputTokens: t.input,
    outputTokens: t.output,
    cacheReadTokens: t.cacheRead,
  }));

  // Efficiency scatter (Req 11.4, 11.5): weighted avg_duration_ms vs total spend
  const efficiencyScatter = modelEfficiencyScatter(models);

  return { spendRanking, requestRanking, tokenStacks, efficiencyScatter };
}

// ─────────────────────────────────────────────────────────────────────────────
// API Key Analysis Aggregates
// ─────────────────────────────────────────────────────────────────────────────

/** Key page aggregates returned to the API layer. */
export interface KeyAggregates {
  rankings: Array<{
    apiKeyId: string;
    apiKeyName: string | null;
    spend: string;
    requestCount: number;
    ownerLabel: string;
    deleted: boolean;
  }>;
  keyHealth: KeyHealth;
  allKeysDailyTrend: {
    spend: TrendPointDto[];
    requests: TrendPointDto[];
  };
}

/**
 * Compute API Key Analysis page aggregates for a selected Billing_Month.
 *
 * Sources: Key_Usage_Records and Daily_Usage_Records (never request_detail for
 * the aggregate view — per-key request_detail trends are served by the DuckDB
 * query path separately).
 * Requirements: 3.6, 12.1–12.6
 */
export function getKeyAggregates(
  store: InMemoryRecordStore,
  month: string,
): KeyAggregates {
  const keys = store.keyUsage(month);
  const months = store.availableMonths();
  const monthIdx = months.indexOf(month);
  const precedingMonth = monthIdx > 0 ? months[monthIdx - 1]! : undefined;
  const precedingKeys = precedingMonth ? store.keyUsage(precedingMonth) : undefined;

  // Key ranking (Req 12.1)
  const rankings = keys.map((r) => ({
    apiKeyId: r.api_key_id,
    apiKeyName: r.api_key_name,
    spend: (r.used_usd ?? new Decimal(0)).toString(),
    requestCount: r.request_count ?? 0,
    ownerLabel: displayLabel(r.username, r.email),
    deleted: r.api_key_deleted ?? false,
  }));

  // Key health (Req 12.4, 12.5, 12.6)
  const keyHealth = classifyKeyHealth({
    keys,
    billingMonth: month,
    precedingKeys,
  });

  // All-keys daily trend (Req 12.2) from Daily_Usage_Records
  const daily = store.dailyUsage(month);
  const allKeysDailyTrend = {
    spend: toTrendDto(
      aggregateTrend(daily, {
        granularity: 'daily',
        date: (r) => r.usage_date,
        metric: (r) => r.used_usd ?? new Decimal(0),
      }),
    ),
    requests: toTrendDto(
      aggregateTrend(daily, {
        granularity: 'daily',
        date: (r) => r.usage_date,
        metric: (r) => new Decimal(r.request_count ?? 0),
      }),
    ),
  };

  return { rankings, keyHealth, allKeysDailyTrend };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost Analysis Aggregates
// ─────────────────────────────────────────────────────────────────────────────

/** Cost page aggregates returned to the API layer. */
export interface CostAggregates {
  trend: {
    daily: TrendPointDto[];
    weekly: TrendPointDto[];
    monthly: TrendPointDto[];
  };
  pareto: ParetoShares;
  forecast: ForecastResult | InsufficientData;
}

/**
 * Compute Cost Analysis page aggregates for a selected Billing_Month.
 *
 * Sources: Daily_Usage_Records and Monthly_Summary_Records (never request_detail).
 * Requirements: 3.6, 13.2, 13.3, 14.1–14.5, 21.4
 */
export function getCostAggregates(
  store: InMemoryRecordStore,
  month: string,
): CostAggregates {
  const daily = store.dailyUsage(month);
  const summaries = store.monthlySummaries(month);

  // Cost trend with daily granularity (Req 13.2)
  const dailyTrend = aggregateTrend(daily, {
    granularity: 'daily',
    date: (r) => r.usage_date,
    metric: (r) => r.used_usd ?? new Decimal(0),
  });

  // Cost trend with weekly granularity (derived from daily records)
  const weeklyTrend = aggregateTrend(daily, {
    granularity: 'weekly',
    date: (r) => r.usage_date,
    metric: (r) => r.used_usd ?? new Decimal(0),
  });

  // Cost trend with monthly granularity (Req 13.3) from Monthly_Summary_Records
  // Aggregate across all available months so the API can show multi-month comparison
  const allMonths = store.availableMonths();
  const allMonthlySummaries = allMonths.flatMap((m) => store.monthlySummaries(m));
  const monthlyTrend = aggregateTrend(allMonthlySummaries, {
    granularity: 'monthly',
    billingMonth: (r) => r.billing_month,
    metric: (r) => r.used_usd ?? new Decimal(0),
  });

  // Pareto concentration (Req 14.1): per-user spends
  const userSpends = summaries.map((r) => r.used_usd ?? new Decimal(0));
  const pareto = paretoShares(userSpends);

  // Forecast (Req 14.2–14.5): aggregate budget from sum of monthly_limit_usd
  const aggregateBudget = sumField(
    summaries,
    (r) => r.monthly_limit_usd ?? new Decimal(0),
  );
  const forecast = forecastMonthEnd(daily, month, aggregateBudget);

  return {
    trend: {
      daily: toTrendDto(dailyTrend),
      weekly: toTrendDto(weeklyTrend),
      monthly: toTrendDto(monthlyTrend),
    },
    pareto,
    forecast,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights and Signals Aggregates
// ─────────────────────────────────────────────────────────────────────────────

/** Insights aggregates returned to the API layer. */
export interface InsightsAggregates {
  topPerformers: TopPerformerRanking | null;
  trends: Insight[];
}

/**
 * Compute insight aggregates (top performers + trend insights) for a Billing_Month.
 *
 * Sources: Monthly_Summary_Records (never request_detail).
 * Requirements: 3.6, 15.1–15.5
 */
export function getInsightsAggregates(
  store: InMemoryRecordStore,
  month: string,
): InsightsAggregates {
  const summaries = store.monthlySummaries(month);
  const months = store.availableMonths();
  const monthIdx = months.indexOf(month);
  const precedingMonth = monthIdx > 0 ? months[monthIdx - 1]! : undefined;
  const preceding = precedingMonth ? store.monthlySummaries(precedingMonth) : undefined;

  return {
    topPerformers: topPerformers(summaries),
    trends: preceding ? trendInsights(summaries, preceding) : [],
  };
}

/** Signal aggregates returned to the API layer. */
export interface SignalAggregates {
  signals: Signal[];
  unreadCount: number;
}

/**
 * Compute signal/anomaly detection for a Billing_Month.
 *
 * Sources: Monthly_Summary_Records and Daily_Usage_Records (never request_detail).
 * Requirements: 3.6, 16.2, 17.1–17.6
 */
export function getSignalAggregates(
  store: InMemoryRecordStore,
  month: string,
): SignalAggregates {
  const summaries = store.monthlySummaries(month);
  const daily = store.dailyUsage(month);

  // Build per-key daily request counts from Daily_Usage_Records.
  // The signal engine needs `keyDailyRequestCounts: Map<string, number[]>` which is
  // per API key -> array of daily request counts. Since Daily_Usage_Records don't
  // have per-key breakdown, we derive this from Key_Usage_Records and daily estimates.
  // Actually, the DetectSignalsInput expects keyDailyRequestCounts which maps key_id
  // to an array of daily request counts. We don't have per-key per-day data in the
  // small summary files. The design shows this comes from request_detail aggregation
  // done server-side. For the summary-based signal detection, we pass an empty map
  // when per-key daily data isn't available from the summary records.
  // The API layer can supply per-key daily counts from DuckDB server-side queries
  // when needed.
  const keyDailyRequestCounts = new Map<string, readonly number[]>();

  const signals = detectSignals({ summaries, daily, keyDailyRequestCounts });

  return {
    signals,
    unreadCount: unreadCount(signals),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert TrendPoint[] to serializable DTOs (value as string for Decimal precision). */
function toTrendDto(points: TrendPoint[]): TrendPointDto[] {
  return points.map((p) => ({ bucket: p.bucket, value: p.value.toString() }));
}
