/**
 * Unit tests for the in-memory record store (Requirement 1.8, design "Data
 * Store"). These cover specific examples and edge cases: month-scoped
 * accessors, cross-month retention, ascending `availableMonths`, incremental
 * loading across folders, and the store returning copies rather than its
 * internal buckets.
 *
 * The universal partitioning property (design Property 10) is covered by the
 * separate property-test task (16.2).
 */
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type {
  MonthlySummaryRecord,
  DailyUsageRecord,
  ModelUsageRecord,
  KeyUsageRecord,
} from '@core/compute';
import { InMemoryRecordStore } from './record-store.js';

function summary(month: string, userId: string): MonthlySummaryRecord {
  return {
    billing_month: month,
    user_id: userId,
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: null,
    used_usd: new Decimal(0),
    remaining_monthly_limit_usd: null,
    usage_percent: null,
    request_count: null,
    api_key_count: null,
    active_days: null,
    input_tokens: null,
    output_tokens: null,
    cache_creation_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    image_count: null,
    input_cost_usd: null,
    output_cost_usd: null,
    cache_creation_cost_usd: null,
    cache_read_cost_usd: null,
    image_output_cost_usd: null,
    actual_cost_usd: null,
    avg_duration_ms: null,
    avg_first_token_ms: null,
    first_request_at: null,
    last_request_at: null,
  };
}

function daily(month: string, userId: string): DailyUsageRecord {
  return {
    billing_month: month,
    usage_date: new Date(`${month}-01T00:00:00Z`),
    user_id: userId,
    email: null,
    username: null,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
  };
}

function model(month: string, userId: string, modelName: string): ModelUsageRecord {
  return {
    billing_month: month,
    user_id: userId,
    email: null,
    username: null,
    model: modelName,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    cache_creation_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
  };
}

function key(month: string, userId: string, apiKeyId: string): KeyUsageRecord {
  return {
    billing_month: month,
    user_id: userId,
    email: null,
    username: null,
    api_key_id: apiKeyId,
    api_key_name: null,
    api_key_status: null,
    api_key_deleted: null,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    first_request_at: null,
    last_request_at: null,
  };
}

describe('InMemoryRecordStore', () => {
  it('returns empty arrays and no months when nothing is loaded', () => {
    const store = new InMemoryRecordStore();
    expect(store.monthlySummaries('2026-04')).toEqual([]);
    expect(store.dailyUsage('2026-04')).toEqual([]);
    expect(store.modelUsage('2026-04')).toEqual([]);
    expect(store.keyUsage('2026-04')).toEqual([]);
    expect(store.availableMonths()).toEqual([]);
  });

  it('returns exactly the records whose Billing_Month matches the query', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [summary('2026-04', 'u1'), summary('2026-05', 'u2'), summary('2026-04', 'u3')],
    });

    const april = store.monthlySummaries('2026-04');
    expect(april.map((r) => r.user_id).sort()).toEqual(['u1', 'u3']);
    expect(april.every((r) => r.billing_month === '2026-04')).toBe(true);

    const may = store.monthlySummaries('2026-05');
    expect(may.map((r) => r.user_id)).toEqual(['u2']);
  });

  it('retains each record Billing_Month for cross-month queries', () => {
    const store = new InMemoryRecordStore({
      dailyUsage: [daily('2026-04', 'u1'), daily('2026-05', 'u1')],
    });
    expect(store.dailyUsage('2026-04')[0]?.billing_month).toBe('2026-04');
    expect(store.dailyUsage('2026-05')[0]?.billing_month).toBe('2026-05');
  });

  it('accumulates records across repeated loads (multiple folders)', () => {
    const store = new InMemoryRecordStore();
    store.load({ monthlySummaries: [summary('2026-04', 'u1')] });
    store.load({ monthlySummaries: [summary('2026-04', 'u2')] });
    store.load({ monthlySummaries: [summary('2026-05', 'u3')] });

    expect(store.monthlySummaries('2026-04').map((r) => r.user_id).sort()).toEqual(['u1', 'u2']);
    expect(store.monthlySummaries('2026-05').map((r) => r.user_id)).toEqual(['u3']);
  });

  it('lists available months across all four sets in ascending order without duplicates', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [summary('2026-05', 'u1')],
      dailyUsage: [daily('2026-04', 'u1')],
      modelUsage: [model('2026-05', 'u1', 'gpt-4')],
      keyUsage: [key('2026-03', 'u1', 'k1')],
    });
    expect(store.availableMonths()).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('exposes all four month-scoped accessors independently', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [summary('2026-04', 'u1')],
      dailyUsage: [daily('2026-04', 'u1')],
      modelUsage: [model('2026-04', 'u1', 'claude-3')],
      keyUsage: [key('2026-04', 'u1', 'k1')],
    });
    expect(store.monthlySummaries('2026-04')).toHaveLength(1);
    expect(store.dailyUsage('2026-04')).toHaveLength(1);
    expect(store.modelUsage('2026-04')).toHaveLength(1);
    expect(store.keyUsage('2026-04')).toHaveLength(1);
  });

  it('returns copies so callers cannot mutate the internal buckets', () => {
    const store = new InMemoryRecordStore({
      monthlySummaries: [summary('2026-04', 'u1')],
    });
    const first = store.monthlySummaries('2026-04');
    first.push(summary('2026-04', 'injected'));
    expect(store.monthlySummaries('2026-04')).toHaveLength(1);
  });
});
