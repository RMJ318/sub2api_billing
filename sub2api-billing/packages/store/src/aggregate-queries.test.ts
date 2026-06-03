/**
 * Unit tests for aggregate query functions (Task 17.6).
 *
 * Validates that the aggregate query service layer correctly wires the pure
 * compute library to serve page aggregates from the in-memory record store,
 * never loading request_detail, and summing USD with no currency conversion.
 */
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { InMemoryRecordStore } from './record-store.js';
import {
  getDashboardAggregates,
  getUserAggregates,
  getUserTrend,
  getModelAggregates,
  getKeyAggregates,
  getCostAggregates,
  getInsightsAggregates,
  getSignalAggregates,
} from './aggregate-queries.js';
import type {
  MonthlySummaryRecord,
  DailyUsageRecord,
  ModelUsageRecord,
  KeyUsageRecord,
} from '@core/compute';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<MonthlySummaryRecord> = {}): MonthlySummaryRecord {
  return {
    billing_month: '2026-05',
    user_id: 'user1',
    email: 'user1@test.com',
    username: 'User One',
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: new Decimal(500),
    monthly_limit_usd: new Decimal(1000),
    used_usd: new Decimal(200),
    remaining_monthly_limit_usd: new Decimal(800),
    usage_percent: 20,
    request_count: 100,
    api_key_count: 2,
    active_days: 15,
    input_tokens: 5000,
    output_tokens: 3000,
    cache_creation_tokens: 100,
    cache_read_tokens: 200,
    image_output_tokens: 50,
    image_count: 5,
    input_cost_usd: new Decimal(50),
    output_cost_usd: new Decimal(80),
    cache_creation_cost_usd: new Decimal(10),
    cache_read_cost_usd: new Decimal(5),
    image_output_cost_usd: new Decimal(15),
    actual_cost_usd: new Decimal(160),
    avg_duration_ms: 500,
    avg_first_token_ms: 100,
    first_request_at: new Date('2026-05-01T00:00:00Z'),
    last_request_at: new Date('2026-05-15T00:00:00Z'),
    ...overrides,
  };
}


function makeDaily(overrides: Partial<DailyUsageRecord> = {}): DailyUsageRecord {
  return {
    billing_month: '2026-05',
    usage_date: new Date('2026-05-01T00:00:00Z'),
    user_id: 'user1',
    email: 'user1@test.com',
    username: 'User One',
    request_count: 10,
    used_usd: new Decimal(20),
    input_tokens: 500,
    output_tokens: 300,
    cache_read_tokens: 50,
    image_output_tokens: 10,
    avg_duration_ms: 400,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ModelUsageRecord> = {}): ModelUsageRecord {
  return {
    billing_month: '2026-05',
    user_id: 'user1',
    email: 'user1@test.com',
    username: 'User One',
    model: 'gpt-4o',
    request_count: 50,
    used_usd: new Decimal(100),
    input_tokens: 2000,
    output_tokens: 1500,
    cache_creation_tokens: 50,
    cache_read_tokens: 100,
    image_output_tokens: 0,
    avg_duration_ms: 600,
    ...overrides,
  };
}

function makeKey(overrides: Partial<KeyUsageRecord> = {}): KeyUsageRecord {
  return {
    billing_month: '2026-05',
    user_id: 'user1',
    email: 'user1@test.com',
    username: 'User One',
    api_key_id: 'key1',
    api_key_name: 'My Key',
    api_key_status: 'active',
    api_key_deleted: false,
    request_count: 50,
    used_usd: new Decimal(100),
    input_tokens: 2000,
    output_tokens: 1500,
    first_request_at: new Date('2026-05-01T00:00:00Z'),
    last_request_at: new Date('2026-05-20T00:00:00Z'),
    ...overrides,
  };
}

// ─── Dashboard Aggregates ────────────────────────────────────────────────────

describe('getDashboardAggregates', () => {
  it('computes KPIs from summary records', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({ user_id: 'u1', used_usd: new Decimal(200), request_count: 100 }),
        makeSummary({ user_id: 'u2', used_usd: new Decimal(300), request_count: 50 }),
      ],
    });

    const result = getDashboardAggregates(store, '2026-05');

    expect(result.kpis.totalSpendUsd.equals(new Decimal(500))).toBe(true);
    expect(result.kpis.activeUserCount).toBe(2);
    expect(result.kpis.totalRequestCount).toBe(150);
  });

  it('computes daily trends from daily records', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [makeSummary()],
      dailyUsage: [
        makeDaily({ usage_date: new Date('2026-05-01T00:00:00Z'), used_usd: new Decimal(10) }),
        makeDaily({ usage_date: new Date('2026-05-02T00:00:00Z'), used_usd: new Decimal(20) }),
      ],
    });

    const result = getDashboardAggregates(store, '2026-05');

    expect(result.dailyTrends.spend).toHaveLength(2);
    expect(result.dailyTrends.spend[0]!.bucket).toBe('2026-05-01');
    expect(result.dailyTrends.spend[0]!.value).toBe('10');
    expect(result.dailyTrends.spend[1]!.bucket).toBe('2026-05-02');
    expect(result.dailyTrends.spend[1]!.value).toBe('20');
  });

  it('computes model family share from model records', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [makeSummary()],
      modelUsage: [
        makeModel({ model: 'gpt-4o', used_usd: new Decimal(100) }),
        makeModel({ model: 'claude-3-opus', used_usd: new Decimal(80) }),
        makeModel({ model: 'gemini-pro', used_usd: new Decimal(50) }),
        makeModel({ model: 'llama-3', used_usd: new Decimal(30) }),
      ],
    });

    const result = getDashboardAggregates(store, '2026-05');

    expect(result.modelFamilyShare.GPT).toBe('100');
    expect(result.modelFamilyShare.Claude).toBe('80');
    expect(result.modelFamilyShare.Gemini).toBe('50');
    expect(result.modelFamilyShare.Other).toBe('30');
  });

  it('computes cost composition from summary records', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({
          input_cost_usd: new Decimal(50),
          output_cost_usd: new Decimal(80),
          cache_creation_cost_usd: new Decimal(10),
          cache_read_cost_usd: new Decimal(5),
          image_output_cost_usd: new Decimal(15),
        }),
      ],
    });

    const result = getDashboardAggregates(store, '2026-05');

    expect(result.costComposition.input).toBe('50');
    expect(result.costComposition.output).toBe('80');
    expect(result.costComposition.cacheCreation).toBe('10');
    expect(result.costComposition.cacheRead).toBe('5');
    expect(result.costComposition.imageOutput).toBe('15');
  });

  it('computes KPI comparison when preceding month exists', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({ billing_month: '2026-04', used_usd: new Decimal(100), request_count: 50 }),
        makeSummary({ billing_month: '2026-05', used_usd: new Decimal(200), request_count: 100 }),
      ],
    });

    const result = getDashboardAggregates(store, '2026-05');

    expect(result.kpis.comparison).toBeDefined();
    expect(result.kpis.comparison!.totalSpendUsd).toEqual({
      comparable: true,
      changePct: 100,
    });
  });

  it('returns empty trends and zero KPIs for month with no data', () => {
    const store = new InMemoryRecordStore();

    const result = getDashboardAggregates(store, '2026-05');

    expect(result.kpis.totalSpendUsd.equals(new Decimal(0))).toBe(true);
    expect(result.kpis.activeUserCount).toBe(0);
    expect(result.dailyTrends.spend).toHaveLength(0);
    expect(result.topUserSpend).toHaveLength(0);
  });
});

// ─── User Aggregates ─────────────────────────────────────────────────────────

describe('getUserAggregates', () => {
  it('produces user rankings from summary records', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({ user_id: 'u1', username: 'Alice', used_usd: new Decimal(300) }),
        makeSummary({ user_id: 'u2', username: 'Bob', used_usd: new Decimal(100) }),
      ],
    });

    const result = getUserAggregates(store, '2026-05');

    expect(result.rankings).toHaveLength(2);
    expect(result.rankings[0]!.userId).toBe('u1');
    expect(result.rankings[0]!.label).toBe('Alice');
    expect(result.rankings[0]!.spend).toBe('300');
  });

  it('computes activity scatter points', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({ user_id: 'u1', request_count: 100, used_usd: new Decimal(200) }),
      ],
    });

    const result = getUserAggregates(store, '2026-05');

    expect(result.activityScatter).toHaveLength(1);
    expect(result.activityScatter[0]!.x).toBe(100);
    expect(result.activityScatter[0]!.y.equals(new Decimal(200))).toBe(true);
  });

  it('sorts budget monitor by usage percent descending', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({ user_id: 'u1', used_usd: new Decimal(50), monthly_limit_usd: new Decimal(1000) }),
        makeSummary({ user_id: 'u2', used_usd: new Decimal(900), monthly_limit_usd: new Decimal(1000) }),
      ],
    });

    const result = getUserAggregates(store, '2026-05');

    expect(result.budgetMonitor[0]!.userId).toBe('u2');
    expect(result.budgetMonitor[0]!.usagePct).toBe(90);
    expect(result.budgetMonitor[0]!.style).toBe('warning');
    expect(result.budgetMonitor[1]!.userId).toBe('u1');
    expect(result.budgetMonitor[1]!.usagePct).toBe(5);
    expect(result.budgetMonitor[1]!.style).toBe('normal');
  });
});

// ─── User Trend ──────────────────────────────────────────────────────────────

describe('getUserTrend', () => {
  it('returns per-user daily trend data', () => {
    const store = new InMemoryRecordStore({
      dailyUsage: [
        makeDaily({ user_id: 'u1', usage_date: new Date('2026-05-01T00:00:00Z'), used_usd: new Decimal(10) }),
        makeDaily({ user_id: 'u1', usage_date: new Date('2026-05-02T00:00:00Z'), used_usd: new Decimal(15) }),
        makeDaily({ user_id: 'u2', usage_date: new Date('2026-05-01T00:00:00Z'), used_usd: new Decimal(99) }),
      ],
    });

    const result = getUserTrend(store, '2026-05', 'u1');

    expect(result.spend).toHaveLength(2);
    expect(result.spend[0]!.value).toBe('10');
    expect(result.spend[1]!.value).toBe('15');
  });

  it('returns empty arrays for unknown user', () => {
    const store = new InMemoryRecordStore({
      dailyUsage: [makeDaily({ user_id: 'u1' })],
    });

    const result = getUserTrend(store, '2026-05', 'unknown');

    expect(result.spend).toHaveLength(0);
    expect(result.requests).toHaveLength(0);
    expect(result.tokens).toHaveLength(0);
  });
});

// ─── Model Aggregates ────────────────────────────────────────────────────────

describe('getModelAggregates', () => {
  it('computes spend ranking by model sorted descending', () => {
    const store = new InMemoryRecordStore({
      modelUsage: [
        makeModel({ model: 'gpt-4o', used_usd: new Decimal(200) }),
        makeModel({ model: 'claude-3', used_usd: new Decimal(300) }),
      ],
    });

    const result = getModelAggregates(store, '2026-05');

    expect(result.spendRanking[0]!.model).toBe('claude-3');
    expect(result.spendRanking[0]!.spend).toBe('300');
    expect(result.spendRanking[1]!.model).toBe('gpt-4o');
  });

  it('computes request ranking by model sorted descending', () => {
    const store = new InMemoryRecordStore({
      modelUsage: [
        makeModel({ model: 'gpt-4o', request_count: 50 }),
        makeModel({ model: 'claude-3', request_count: 80 }),
      ],
    });

    const result = getModelAggregates(store, '2026-05');

    expect(result.requestRanking[0]!.model).toBe('claude-3');
    expect(result.requestRanking[0]!.requestCount).toBe(80);
  });

  it('produces token stacks aggregated by model', () => {
    const store = new InMemoryRecordStore({
      modelUsage: [
        makeModel({ model: 'gpt-4o', user_id: 'u1', input_tokens: 100, output_tokens: 50, cache_read_tokens: 10 }),
        makeModel({ model: 'gpt-4o', user_id: 'u2', input_tokens: 200, output_tokens: 100, cache_read_tokens: 20 }),
      ],
    });

    const result = getModelAggregates(store, '2026-05');

    const gpt = result.tokenStacks.find((t) => t.model === 'gpt-4o');
    expect(gpt).toBeDefined();
    expect(gpt!.inputTokens).toBe(300);
    expect(gpt!.outputTokens).toBe(150);
    expect(gpt!.cacheReadTokens).toBe(30);
  });

  it('produces efficiency scatter with one point per model', () => {
    const store = new InMemoryRecordStore({
      modelUsage: [
        makeModel({ model: 'gpt-4o', user_id: 'u1' }),
        makeModel({ model: 'gpt-4o', user_id: 'u2' }),
        makeModel({ model: 'claude-3', user_id: 'u1' }),
      ],
    });

    const result = getModelAggregates(store, '2026-05');

    expect(result.efficiencyScatter).toHaveLength(2);
  });
});

// ─── Key Aggregates ──────────────────────────────────────────────────────────

describe('getKeyAggregates', () => {
  it('produces key rankings with owner label', () => {
    const store = new InMemoryRecordStore({
      keyUsage: [
        makeKey({ api_key_id: 'k1', api_key_name: 'Prod Key', username: 'Alice' }),
        makeKey({ api_key_id: 'k2', api_key_name: 'Dev Key', username: 'Bob' }),
      ],
    });

    const result = getKeyAggregates(store, '2026-05');

    expect(result.rankings).toHaveLength(2);
    expect(result.rankings[0]!.apiKeyId).toBe('k1');
    expect(result.rankings[0]!.ownerLabel).toBe('Alice');
  });

  it('classifies key health with long-unused detection', () => {
    const store = new InMemoryRecordStore({
      keyUsage: [
        makeKey({
          api_key_id: 'k1',
          last_request_at: new Date('2026-05-01T00:00:00Z'), // recent
        }),
        makeKey({
          api_key_id: 'k2',
          last_request_at: new Date('2026-05-10T00:00:00Z'), // > 14 days before month end (May 31)
        }),
      ],
    });

    const result = getKeyAggregates(store, '2026-05');

    // k2's last_request_at is May 10, month end is May 31, diff is 21 days > 14
    expect(result.keyHealth.longUnused.some((k) => k.api_key_id === 'k2')).toBe(true);
  });

  it('returns all-keys daily trend', () => {
    const store = new InMemoryRecordStore({
      keyUsage: [makeKey()],
      dailyUsage: [
        makeDaily({ usage_date: new Date('2026-05-01T00:00:00Z'), used_usd: new Decimal(10) }),
        makeDaily({ usage_date: new Date('2026-05-02T00:00:00Z'), used_usd: new Decimal(20) }),
      ],
    });

    const result = getKeyAggregates(store, '2026-05');

    expect(result.allKeysDailyTrend.spend).toHaveLength(2);
  });
});

// ─── Cost Aggregates ─────────────────────────────────────────────────────────

describe('getCostAggregates', () => {
  it('computes cost trends with daily granularity (Req 13.2)', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [makeSummary()],
      dailyUsage: [
        makeDaily({ usage_date: new Date('2026-05-01T00:00:00Z'), used_usd: new Decimal(10) }),
        makeDaily({ usage_date: new Date('2026-05-02T00:00:00Z'), used_usd: new Decimal(20) }),
        makeDaily({ usage_date: new Date('2026-05-03T00:00:00Z'), used_usd: new Decimal(30) }),
      ],
    });

    const result = getCostAggregates(store, '2026-05');

    expect(result.trend.daily).toHaveLength(3);
    expect(result.trend.daily[0]!.bucket).toBe('2026-05-01');
  });

  it('computes monthly trend from Monthly_Summary_Records (Req 13.3)', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({ billing_month: '2026-04', used_usd: new Decimal(500) }),
        makeSummary({ billing_month: '2026-05', used_usd: new Decimal(700) }),
      ],
      dailyUsage: [
        makeDaily({ billing_month: '2026-05', usage_date: new Date('2026-05-01T00:00:00Z') }),
        makeDaily({ billing_month: '2026-05', usage_date: new Date('2026-05-02T00:00:00Z') }),
        makeDaily({ billing_month: '2026-05', usage_date: new Date('2026-05-03T00:00:00Z') }),
      ],
    });

    const result = getCostAggregates(store, '2026-05');

    expect(result.trend.monthly).toHaveLength(2);
    expect(result.trend.monthly[0]!.bucket).toBe('2026-04');
    expect(result.trend.monthly[0]!.value).toBe('500');
    expect(result.trend.monthly[1]!.bucket).toBe('2026-05');
    expect(result.trend.monthly[1]!.value).toBe('700');
  });

  it('computes Pareto shares from user spends', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({ user_id: 'u1', used_usd: new Decimal(500) }),
        makeSummary({ user_id: 'u2', used_usd: new Decimal(300) }),
        makeSummary({ user_id: 'u3', used_usd: new Decimal(100) }),
        makeSummary({ user_id: 'u4', used_usd: new Decimal(100) }),
      ],
      dailyUsage: [
        makeDaily({ usage_date: new Date('2026-05-01T00:00:00Z') }),
        makeDaily({ usage_date: new Date('2026-05-02T00:00:00Z') }),
        makeDaily({ usage_date: new Date('2026-05-03T00:00:00Z') }),
      ],
    });

    const result = getCostAggregates(store, '2026-05');

    expect(result.pareto.top10).toBeGreaterThan(0);
    expect(result.pareto.top10).toBeLessThanOrEqual(result.pareto.top20);
    expect(result.pareto.top20).toBeLessThanOrEqual(result.pareto.top30);
  });

  it('returns InsufficientData when fewer than 3 days of daily data', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [makeSummary()],
      dailyUsage: [
        makeDaily({ usage_date: new Date('2026-05-01T00:00:00Z') }),
        makeDaily({ usage_date: new Date('2026-05-02T00:00:00Z') }),
      ],
    });

    const result = getCostAggregates(store, '2026-05');

    expect('insufficient' in result.forecast).toBe(true);
  });

  it('returns ForecastResult when sufficient daily data exists', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [makeSummary({ monthly_limit_usd: new Decimal(1000) })],
      dailyUsage: [
        makeDaily({ usage_date: new Date('2026-05-01T00:00:00Z'), used_usd: new Decimal(30) }),
        makeDaily({ usage_date: new Date('2026-05-02T00:00:00Z'), used_usd: new Decimal(30) }),
        makeDaily({ usage_date: new Date('2026-05-03T00:00:00Z'), used_usd: new Decimal(30) }),
      ],
    });

    const result = getCostAggregates(store, '2026-05');

    expect('projectedMonthEndSpendUsd' in result.forecast).toBe(true);
  });
});

// ─── Insights Aggregates ─────────────────────────────────────────────────────

describe('getInsightsAggregates', () => {
  it('produces top performers when data is non-trivial', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({ user_id: 'u1', used_usd: new Decimal(500), request_count: 100 }),
        makeSummary({ user_id: 'u2', used_usd: new Decimal(300), request_count: 200 }),
      ],
    });

    const result = getInsightsAggregates(store, '2026-05');

    expect(result.topPerformers).not.toBeNull();
    expect(result.topPerformers!.bySpend!.userId).toBe('u1');
    expect(result.topPerformers!.byRequests!.userId).toBe('u2');
  });

  it('returns null top performers when all users are zero', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({
          user_id: 'u1',
          used_usd: new Decimal(0),
          request_count: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_tokens: 0,
          cache_read_tokens: 0,
          image_output_tokens: 0,
        }),
      ],
    });

    const result = getInsightsAggregates(store, '2026-05');

    expect(result.topPerformers).toBeNull();
  });

  it('generates trend insights when preceding month exists', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({ billing_month: '2026-04', used_usd: new Decimal(100), request_count: 50 }),
        makeSummary({ billing_month: '2026-05', used_usd: new Decimal(200), request_count: 100 }),
      ],
    });

    const result = getInsightsAggregates(store, '2026-05');

    expect(result.trends.length).toBeGreaterThan(0);
    expect(result.trends.some((i) => i.id === 'trend_spend')).toBe(true);
  });

  it('returns empty trends when no preceding month', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [makeSummary({ billing_month: '2026-05' })],
    });

    const result = getInsightsAggregates(store, '2026-05');

    expect(result.trends).toHaveLength(0);
  });
});

// ─── Signal Aggregates ───────────────────────────────────────────────────────

describe('getSignalAggregates', () => {
  it('detects low-balance alerts', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({
          user_id: 'u1',
          remaining_monthly_limit_usd: new Decimal(50),
          monthly_limit_usd: new Decimal(1000),
        }),
      ],
    });

    const result = getSignalAggregates(store, '2026-05');

    const lowBalance = result.signals.filter((s) => s.group === 'low_balance');
    expect(lowBalance.length).toBeGreaterThan(0);
  });

  it('detects response-time anomalies', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({
          user_id: 'u1',
          avg_duration_ms: 70000, // > 60000 threshold
        }),
      ],
    });

    const result = getSignalAggregates(store, '2026-05');

    const rtAnomalies = result.signals.filter((s) => s.group === 'response_time_anomaly');
    expect(rtAnomalies.length).toBeGreaterThan(0);
  });

  it('computes unread count', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({
          remaining_monthly_limit_usd: new Decimal(50),
          monthly_limit_usd: new Decimal(1000),
        }),
      ],
    });

    const result = getSignalAggregates(store, '2026-05');

    // All newly detected signals are unread by default
    expect(result.unreadCount).toBe(result.signals.length);
  });

  it('returns empty signals when no rules trigger', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [
        makeSummary({
          remaining_monthly_limit_usd: new Decimal(800),
          monthly_limit_usd: new Decimal(1000),
          avg_duration_ms: 200,
        }),
      ],
    });

    const result = getSignalAggregates(store, '2026-05');

    // No low balance (remaining 80%), no high duration
    const lowBalance = result.signals.filter((s) => s.group === 'low_balance');
    const rtAnomaly = result.signals.filter((s) => s.group === 'response_time_anomaly');
    expect(lowBalance).toHaveLength(0);
    expect(rtAnomaly).toHaveLength(0);
  });
});
