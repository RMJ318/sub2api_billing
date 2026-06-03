import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import { topPerformers, trendInsights } from './insights.js';
import type { TopPerformerRanking, Insight } from './insights.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * Unit tests for the Insight Engine (Requirements 15.1-15.5).
 */

/** Build a MonthlySummaryRecord with all-null optionals, overriding as needed. */
function summary(
  overrides: Partial<MonthlySummaryRecord> & { user_id: string },
): MonthlySummaryRecord {
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

// ─────────────────────────────────────────────────────────────────────────────
// topPerformers
// ─────────────────────────────────────────────────────────────────────────────

describe('topPerformers', () => {
  it('returns null for an empty summaries array', () => {
    expect(topPerformers([])).toBeNull();
  });

  it('returns null when all users have zero spend, requests, and tokens (Req 15.2)', () => {
    const records = [
      summary({ user_id: 'u1', used_usd: new Decimal(0), request_count: 0 }),
      summary({ user_id: 'u2', used_usd: new Decimal(0), request_count: 0 }),
    ];
    expect(topPerformers(records)).toBeNull();
  });

  it('ranks the top user by spend when at least one user has non-zero spend (Req 15.1)', () => {
    const records = [
      summary({ user_id: 'u1', username: 'alice', used_usd: new Decimal('100'), request_count: 5 }),
      summary({ user_id: 'u2', username: 'bob', used_usd: new Decimal('200'), request_count: 3 }),
    ];
    const result = topPerformers(records);
    expect(result).not.toBeNull();
    expect(result!.bySpend).toEqual({
      userId: 'u2',
      label: 'bob',
      value: '200',
    });
  });

  it('ranks the top user by request count (Req 15.1)', () => {
    const records = [
      summary({ user_id: 'u1', username: 'alice', used_usd: new Decimal('50'), request_count: 100 }),
      summary({ user_id: 'u2', username: 'bob', used_usd: new Decimal('200'), request_count: 30 }),
    ];
    const result = topPerformers(records);
    expect(result).not.toBeNull();
    expect(result!.byRequests).toEqual({
      userId: 'u1',
      label: 'alice',
      value: 100,
    });
  });

  it('ranks the top user by token count (sum of all five token fields) (Req 15.1)', () => {
    const records = [
      summary({
        user_id: 'u1',
        username: 'alice',
        used_usd: new Decimal('10'),
        request_count: 1,
        input_tokens: 500,
        output_tokens: 200,
        cache_creation_tokens: 10,
        cache_read_tokens: 5,
        image_output_tokens: 3,
      }),
      summary({
        user_id: 'u2',
        username: 'bob',
        used_usd: new Decimal('10'),
        request_count: 1,
        input_tokens: 100,
        output_tokens: 50,
      }),
    ];
    const result = topPerformers(records);
    expect(result).not.toBeNull();
    // u1 tokens: 500+200+10+5+3 = 718; u2 tokens: 100+50 = 150
    expect(result!.byTokens).toEqual({
      userId: 'u1',
      label: 'alice',
      value: 718,
    });
  });

  it('returns null for a metric when all users are zero for that metric', () => {
    const records = [
      summary({
        user_id: 'u1',
        username: 'alice',
        used_usd: new Decimal('100'),
        request_count: 0,
        // no tokens
      }),
    ];
    const result = topPerformers(records);
    expect(result).not.toBeNull();
    expect(result!.bySpend).not.toBeNull();
    expect(result!.byRequests).toBeNull();
    expect(result!.byTokens).toBeNull();
  });

  it('falls back to email when username is null for the label', () => {
    const records = [
      summary({
        user_id: 'u1',
        email: 'alice@example.com',
        used_usd: new Decimal('50'),
        request_count: 10,
      }),
    ];
    const result = topPerformers(records);
    expect(result).not.toBeNull();
    expect(result!.bySpend!.label).toBe('alice@example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// trendInsights
// ─────────────────────────────────────────────────────────────────────────────

describe('trendInsights', () => {
  it('returns empty array when current month is empty (Req 15.5)', () => {
    const preceding = [summary({ user_id: 'u1', used_usd: new Decimal('100'), request_count: 10 })];
    expect(trendInsights([], preceding)).toEqual([]);
  });

  it('returns empty array when preceding month is empty (Req 15.5)', () => {
    const current = [summary({ user_id: 'u1', used_usd: new Decimal('100'), request_count: 10 })];
    expect(trendInsights(current, [])).toEqual([]);
  });

  it('produces trend insights for spend, active users, and requests (Req 15.3)', () => {
    const preceding = [
      summary({
        user_id: 'u1',
        billing_month: '2026-04',
        used_usd: new Decimal('100'),
        request_count: 10,
      }),
    ];
    const current = [
      summary({
        user_id: 'u1',
        used_usd: new Decimal('150'),
        request_count: 20,
      }),
    ];
    const insights = trendInsights(current, preceding);

    // Should have 3 insights: spend, active users, requests
    expect(insights.length).toBe(3);
    expect(insights.map((i) => i.id)).toEqual([
      'trend_spend',
      'trend_active_users',
      'trend_requests',
    ]);
  });

  it('reports correct direction and magnitude for spend increase (Req 15.4)', () => {
    const preceding = [
      summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100'), request_count: 10 }),
    ];
    const current = [
      summary({ user_id: 'u1', used_usd: new Decimal('150'), request_count: 10 }),
    ];
    const insights = trendInsights(current, preceding);
    const spendInsight = insights.find((i) => i.id === 'trend_spend')!;
    expect(spendInsight.text).toContain('increased');
    expect(spendInsight.text).toContain('50');
    expect(spendInsight.metricValue).toBe('150');
    expect(spendInsight.kind).toBe('trend');
  });

  it('reports correct direction for spend decrease (Req 15.4)', () => {
    const preceding = [
      summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('200'), request_count: 10 }),
    ];
    const current = [
      summary({ user_id: 'u1', used_usd: new Decimal('100'), request_count: 10 }),
    ];
    const insights = trendInsights(current, preceding);
    const spendInsight = insights.find((i) => i.id === 'trend_spend')!;
    expect(spendInsight.text).toContain('decreased');
    expect(spendInsight.text).toContain('50');
  });

  it('omits a metric insight when the preceding value is zero (Req 15.5)', () => {
    const preceding = [
      summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('0'), request_count: 0 }),
    ];
    const current = [
      summary({ user_id: 'u1', used_usd: new Decimal('100'), request_count: 10 }),
    ];
    const insights = trendInsights(current, preceding);
    // All preceding values are zero, so all insights should be omitted
    expect(insights).toEqual([]);
  });

  it('includes active user count as the supporting metric value', () => {
    const preceding = [
      summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100'), request_count: 10 }),
    ];
    const current = [
      summary({ user_id: 'u1', used_usd: new Decimal('100'), request_count: 10 }),
      summary({ user_id: 'u2', used_usd: new Decimal('50'), request_count: 5 }),
    ];
    const insights = trendInsights(current, preceding);
    const activeInsight = insights.find((i) => i.id === 'trend_active_users')!;
    expect(activeInsight.metricValue).toBe(2);
    expect(activeInsight.text).toContain('increased');
    expect(activeInsight.text).toContain('100'); // 100% increase (1 -> 2)
  });

  it('each insight has kind "trend" (Req 15.4)', () => {
    const preceding = [
      summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100'), request_count: 10 }),
    ];
    const current = [
      summary({ user_id: 'u1', used_usd: new Decimal('200'), request_count: 20 }),
    ];
    const insights = trendInsights(current, preceding);
    for (const insight of insights) {
      expect(insight.kind).toBe('trend');
    }
  });
});
