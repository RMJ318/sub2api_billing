import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { aggregateTrend } from './trend.js';
import type { DailyUsageRecord, MonthlySummaryRecord } from './types/records.js';

function daily(overrides: Partial<DailyUsageRecord>): DailyUsageRecord {
  return {
    billing_month: '2026-04',
    usage_date: new Date('2026-04-01T00:00:00Z'),
    user_id: 'u1',
    email: null,
    username: null,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
    ...overrides,
  };
}

function summary(overrides: Partial<MonthlySummaryRecord>): MonthlySummaryRecord {
  return {
    billing_month: '2026-04',
    user_id: 'u1',
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: null,
    used_usd: null,
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
    ...overrides,
  };
}

describe('aggregateTrend - daily granularity (Req 5.1, 13.2)', () => {
  it('produces one ascending point per occupied day, summing the metric', () => {
    const rows = [
      daily({ usage_date: new Date('2026-04-02T10:00:00Z'), used_usd: new Decimal('2') }),
      daily({ usage_date: new Date('2026-04-01T09:00:00Z'), used_usd: new Decimal('1') }),
      // same day as the first row, different time -> same bucket
      daily({ usage_date: new Date('2026-04-02T23:30:00Z'), used_usd: new Decimal('3') }),
    ];

    const points = aggregateTrend(rows, {
      granularity: 'daily',
      date: (r) => r.usage_date,
      metric: (r) => r.used_usd ?? new Decimal(0),
    });

    expect(points.map((p) => p.bucket)).toEqual(['2026-04-01', '2026-04-02']);
    expect(points[0].value.toString()).toBe('1');
    expect(points[1].value.toString()).toBe('5');
    // ascending by start instant
    expect(points[0].start.getTime()).toBeLessThan(points[1].start.getTime());
  });

  it('omits empty buckets and only represents occupied days', () => {
    const rows = [
      daily({ usage_date: new Date('2026-04-01T00:00:00Z'), request_count: 4 }),
      daily({ usage_date: new Date('2026-04-05T00:00:00Z'), request_count: 6 }),
    ];
    const points = aggregateTrend(rows, {
      granularity: 'daily',
      date: (r) => r.usage_date,
      metric: (r) => new Decimal(r.request_count ?? 0),
    });
    expect(points.map((p) => p.bucket)).toEqual(['2026-04-01', '2026-04-05']);
  });

  it('aggregates a pre-filtered single-user slice without special-casing (Req 10.1)', () => {
    const all = [
      daily({ user_id: 'u1', usage_date: new Date('2026-04-01T00:00:00Z'), used_usd: new Decimal('10') }),
      daily({ user_id: 'u2', usage_date: new Date('2026-04-01T00:00:00Z'), used_usd: new Decimal('99') }),
      daily({ user_id: 'u1', usage_date: new Date('2026-04-02T00:00:00Z'), used_usd: new Decimal('20') }),
    ];
    const filtered = all.filter((r) => r.user_id === 'u1');
    const points = aggregateTrend(filtered, {
      granularity: 'daily',
      date: (r) => r.usage_date,
      metric: (r) => r.used_usd ?? new Decimal(0),
    });
    expect(points.map((p) => p.value.toString())).toEqual(['10', '20']);
  });
});

describe('aggregateTrend - weekly granularity (ISO week, Req 13.1)', () => {
  it('groups dates in the same ISO week into one Monday-keyed bucket', () => {
    // 2026-04-01 is a Wednesday; Mon..Sun of that ISO week are 2026-03-30..04-05.
    const rows = [
      daily({ usage_date: new Date('2026-03-30T00:00:00Z'), used_usd: new Decimal('1') }), // Monday
      daily({ usage_date: new Date('2026-04-01T00:00:00Z'), used_usd: new Decimal('2') }), // Wednesday
      daily({ usage_date: new Date('2026-04-05T00:00:00Z'), used_usd: new Decimal('3') }), // Sunday
      daily({ usage_date: new Date('2026-04-06T00:00:00Z'), used_usd: new Decimal('4') }), // next Monday
    ];
    const points = aggregateTrend(rows, {
      granularity: 'weekly',
      date: (r) => r.usage_date,
      metric: (r) => r.used_usd ?? new Decimal(0),
    });

    expect(points).toHaveLength(2);
    // first bucket: the Mon-Sun week summing 1+2+3 = 6, starting on the Monday
    expect(points[0].value.toString()).toBe('6');
    expect(points[0].start.toISOString()).toBe('2026-03-30T00:00:00.000Z');
    // second bucket: next week with just the Monday row
    expect(points[1].value.toString()).toBe('4');
    expect(points[1].start.toISOString()).toBe('2026-04-06T00:00:00.000Z');
    // ascending
    expect(points[0].start.getTime()).toBeLessThan(points[1].start.getTime());
  });
});

describe('aggregateTrend - monthly granularity (Req 13.3)', () => {
  it('buckets by Billing_Month and orders ascending', () => {
    const rows = [
      summary({ billing_month: '2026-05', used_usd: new Decimal('50') }),
      summary({ billing_month: '2026-04', used_usd: new Decimal('10') }),
      summary({ billing_month: '2026-04', used_usd: new Decimal('5') }),
    ];
    const points = aggregateTrend(rows, {
      granularity: 'monthly',
      billingMonth: (r) => r.billing_month,
      metric: (r) => r.used_usd ?? new Decimal(0),
    });

    expect(points.map((p) => p.bucket)).toEqual(['2026-04', '2026-05']);
    expect(points[0].value.toString()).toBe('15');
    expect(points[1].value.toString()).toBe('50');
    expect(points[0].start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('aggregateTrend - selector guards', () => {
  it('throws when the date selector is missing for daily/weekly', () => {
    expect(() =>
      aggregateTrend([daily({})], { granularity: 'daily', metric: (r) => r.used_usd ?? new Decimal(0) }),
    ).toThrow(TypeError);
  });

  it('throws when the billingMonth selector is missing for monthly', () => {
    expect(() =>
      aggregateTrend([summary({})], { granularity: 'monthly', metric: (r) => r.used_usd ?? new Decimal(0) }),
    ).toThrow(TypeError);
  });

  it('returns an empty series for no records', () => {
    expect(
      aggregateTrend([], { granularity: 'daily', date: (r: DailyUsageRecord) => r.usage_date, metric: () => new Decimal(0) }),
    ).toEqual([]);
  });
});
