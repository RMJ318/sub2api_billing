import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import { computeDashboardKpis } from './index.js';
import type { DashboardKpis } from './index.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * Example unit tests for `computeDashboardKpis` (Requirement 4.2-4.10).
 *
 * These pin down the worked KPI math and the month-over-month comparison
 * behavior on concrete inputs. The universal invariants are covered separately
 * by Properties 11-15 (tasks 6.2-6.5).
 */

/** Build a MonthlySummaryRecord with all-null optionals, overriding as needed. */
function summary(overrides: Partial<MonthlySummaryRecord> & { user_id: string }): MonthlySummaryRecord {
  return {
    billing_month: '2026-05',
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

describe('computeDashboardKpis - single month aggregates', () => {
  const records: MonthlySummaryRecord[] = [
    summary({
      user_id: 'u1',
      used_usd: new Decimal('100.500000'),
      monthly_limit_usd: new Decimal('1000'),
      request_count: 10,
      api_key_count: 2,
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_tokens: 5,
      cache_read_tokens: 3,
      image_output_tokens: 2,
      avg_duration_ms: 200,
    }),
    summary({
      user_id: 'u2',
      used_usd: new Decimal('399.500000'),
      monthly_limit_usd: new Decimal('1000'),
      request_count: 30,
      api_key_count: 1,
      input_tokens: 40,
      output_tokens: 10,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      image_output_tokens: 0,
      avg_duration_ms: 100,
    }),
    // Inactive user (request_count 0) - excluded from active user count.
    summary({ user_id: 'u3', used_usd: new Decimal('0'), monthly_limit_usd: new Decimal('500'), request_count: 0 }),
  ];

  const kpis = computeDashboardKpis(records);

  it('sums total Spend as a precise decimal (Req 4.2)', () => {
    expect(kpis.totalSpendUsd.toString()).toBe('500');
  });

  it('counts distinct active users with request_count >= 1 (Req 4.3)', () => {
    expect(kpis.activeUserCount).toBe(2);
  });

  it('sums the five token fields (Req 4.4)', () => {
    // u1: 100+50+5+3+2 = 160; u2: 40+10 = 50; u3: 0 => 210
    expect(kpis.totalTokenCount).toBe(210);
  });

  it('sums request count (Req 4.5)', () => {
    expect(kpis.totalRequestCount).toBe(40);
  });

  it('sums api key count (Req 4.6)', () => {
    expect(kpis.totalApiKeyCount).toBe(3);
  });

  it('computes request-weighted average response time (Req 4.7)', () => {
    // (200*10 + 100*30 + 0*0) / (10 + 30) = 5000 / 40 = 125
    expect(kpis.avgResponseMs).toBe(125);
  });

  it('computes budget usage rate rounded to 1 dp (Req 4.8)', () => {
    // 500 / (1000 + 1000 + 500) * 100 = 500 / 2500 * 100 = 20.0
    expect(kpis.budgetUsageRatePct).toBe(20);
  });

  it('omits comparison when no preceding month is given', () => {
    expect(kpis.comparison).toBeUndefined();
  });
});

describe('computeDashboardKpis - budget usage rate edge cases', () => {
  it('returns 0 when the monthly_limit_usd sum is 0 (Req 4.9)', () => {
    const records: MonthlySummaryRecord[] = [
      summary({ user_id: 'u1', used_usd: new Decimal('50'), monthly_limit_usd: new Decimal('0') }),
    ];
    expect(computeDashboardKpis(records).budgetUsageRatePct).toBe(0);
  });

  it('rounds the rate to one decimal place', () => {
    const records: MonthlySummaryRecord[] = [
      summary({ user_id: 'u1', used_usd: new Decimal('333.333'), monthly_limit_usd: new Decimal('1000') }),
    ];
    // 333.333 / 1000 * 100 = 33.3333 -> 33.3
    expect(computeDashboardKpis(records).budgetUsageRatePct).toBe(33.3);
  });

  it('treats empty (null) money and count fields as zero', () => {
    const records: MonthlySummaryRecord[] = [summary({ user_id: 'u1' })];
    const kpis = computeDashboardKpis(records);
    expect(kpis.totalSpendUsd.toString()).toBe('0');
    expect(kpis.totalRequestCount).toBe(0);
    expect(kpis.totalTokenCount).toBe(0);
    expect(kpis.totalApiKeyCount).toBe(0);
    expect(kpis.avgResponseMs).toBe(0);
    expect(kpis.budgetUsageRatePct).toBe(0);
    expect(kpis.activeUserCount).toBe(0);
  });

  it('returns zeroed KPIs for an empty month', () => {
    const kpis = computeDashboardKpis([]);
    expect(kpis.totalSpendUsd.toString()).toBe('0');
    expect(kpis.activeUserCount).toBe(0);
    expect(kpis.budgetUsageRatePct).toBe(0);
  });
});

describe('computeDashboardKpis - month-over-month comparison (Req 4.10)', () => {
  const preceding: MonthlySummaryRecord[] = [
    summary({
      user_id: 'u1',
      billing_month: '2026-04',
      used_usd: new Decimal('100'),
      monthly_limit_usd: new Decimal('1000'),
      request_count: 10,
      api_key_count: 2,
      input_tokens: 100,
      avg_duration_ms: 100,
    }),
  ];

  it('computes (current - preceding) / preceding * 100 per KPI', () => {
    const current: MonthlySummaryRecord[] = [
      summary({
        user_id: 'u1',
        used_usd: new Decimal('150'),
        monthly_limit_usd: new Decimal('1000'),
        request_count: 20,
        api_key_count: 3,
        input_tokens: 200,
        avg_duration_ms: 150,
      }),
    ];
    const kpis = computeDashboardKpis(current, preceding);
    const comparison = kpis.comparison;
    expect(comparison).toBeDefined();
    if (comparison === undefined) return;

    // Spend: (150 - 100) / 100 * 100 = 50
    expect(comparison.totalSpendUsd).toEqual({ comparable: true, changePct: 50 });
    // Requests: (20 - 10) / 10 * 100 = 100
    expect(comparison.totalRequestCount).toEqual({ comparable: true, changePct: 100 });
    // API keys: (3 - 2) / 2 * 100 = 50
    expect(comparison.totalApiKeyCount).toEqual({ comparable: true, changePct: 50 });
    // Tokens: (200 - 100) / 100 * 100 = 100
    expect(comparison.totalTokenCount).toEqual({ comparable: true, changePct: 100 });
  });

  it('signals no comparison when the preceding value is zero', () => {
    const precedingZero: MonthlySummaryRecord[] = [
      summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('0'), request_count: 0 }),
    ];
    const current: MonthlySummaryRecord[] = [
      summary({ user_id: 'u1', used_usd: new Decimal('100'), request_count: 5 }),
    ];
    const kpis: DashboardKpis = computeDashboardKpis(current, precedingZero);
    expect(kpis.comparison?.totalSpendUsd).toEqual({ comparable: false });
    expect(kpis.comparison?.totalRequestCount).toEqual({ comparable: false });
    expect(kpis.comparison?.activeUserCount).toEqual({ comparable: false });
  });
});
