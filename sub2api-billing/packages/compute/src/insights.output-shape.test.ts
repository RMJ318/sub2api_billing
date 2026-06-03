import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import { topPerformers, trendInsights } from './insights.js';
import type { Insight, TopPerformerRanking } from './insights.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * Unit tests for insight output shape (Task 11.4).
 *
 * Validates:
 * - Each insight has: id, text (non-empty short string), metricValue (number or string),
 *   and kind ('trend' or 'top_performer')
 * - When inputs are unavailable (empty arrays, zero preceding), insights are simply
 *   absent from the result (not present with placeholder text)
 *
 * **Validates: Requirements 15.4, 15.5**
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
// Insight shape validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Asserts that an Insight object conforms to the expected shape:
 * - `id`: non-empty string
 * - `text`: non-empty short string (< 200 chars as a reasonable "short" bound)
 * - `metricValue`: number or string
 * - `kind`: 'trend' or 'top_performer'
 */
function assertInsightShape(insight: Insight): void {
  expect(insight).toHaveProperty('id');
  expect(insight).toHaveProperty('text');
  expect(insight).toHaveProperty('metricValue');
  expect(insight).toHaveProperty('kind');

  expect(typeof insight.id).toBe('string');
  expect(insight.id.length).toBeGreaterThan(0);

  expect(typeof insight.text).toBe('string');
  expect(insight.text.length).toBeGreaterThan(0);
  expect(insight.text.length).toBeLessThan(200);

  expect(
    typeof insight.metricValue === 'number' || typeof insight.metricValue === 'string',
  ).toBe(true);

  expect(['trend', 'top_performer']).toContain(insight.kind);
}

// ─────────────────────────────────────────────────────────────────────────────
// trendInsights output shape
// ─────────────────────────────────────────────────────────────────────────────

describe('trendInsights output shape (Req 15.4, 15.5)', () => {
  const preceding = [
    summary({
      user_id: 'u1',
      billing_month: '2026-04',
      used_usd: new Decimal('100'),
      request_count: 10,
    }),
    summary({
      user_id: 'u2',
      billing_month: '2026-04',
      used_usd: new Decimal('50'),
      request_count: 5,
    }),
  ];

  const current = [
    summary({
      user_id: 'u1',
      used_usd: new Decimal('150'),
      request_count: 20,
    }),
    summary({
      user_id: 'u2',
      used_usd: new Decimal('80'),
      request_count: 12,
    }),
    summary({
      user_id: 'u3',
      used_usd: new Decimal('30'),
      request_count: 3,
    }),
  ];

  it('every returned insight conforms to {id, text, metricValue, kind} shape', () => {
    const insights = trendInsights(current, preceding);
    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      assertInsightShape(insight);
    }
  });

  it('all trend insights have kind "trend"', () => {
    const insights = trendInsights(current, preceding);
    for (const insight of insights) {
      expect(insight.kind).toBe('trend');
    }
  });

  it('text is a short descriptive statement (contains direction word)', () => {
    const insights = trendInsights(current, preceding);
    for (const insight of insights) {
      const hasDirection =
        insight.text.includes('increased') || insight.text.includes('decreased');
      expect(hasDirection).toBe(true);
    }
  });

  it('metricValue is a number or numeric string for each trend insight', () => {
    const insights = trendInsights(current, preceding);
    for (const insight of insights) {
      if (typeof insight.metricValue === 'string') {
        // String metric values should be parseable as numbers (e.g. Decimal spend)
        expect(Number.isNaN(Number(insight.metricValue))).toBe(false);
      } else {
        expect(typeof insight.metricValue).toBe('number');
      }
    }
  });

  // --- Omission tests (Req 15.5): insights are absent, not placeholder ---

  it('returns empty array (no insights) when current is an empty array', () => {
    const result = trendInsights([], preceding);
    expect(result).toEqual([]);
  });

  it('returns empty array (no insights) when preceding is an empty array', () => {
    const result = trendInsights(current, []);
    expect(result).toEqual([]);
  });

  it('omits spend insight when preceding spend is zero (no placeholder)', () => {
    const zeroPreceding = [
      summary({
        user_id: 'u1',
        billing_month: '2026-04',
        used_usd: new Decimal('0'),
        request_count: 10,
      }),
    ];
    const insights = trendInsights(current, zeroPreceding);
    const spendInsight = insights.find((i) => i.id === 'trend_spend');
    expect(spendInsight).toBeUndefined();
  });

  it('omits active users insight when preceding active users is zero (no placeholder)', () => {
    const zeroPreceding = [
      summary({
        user_id: 'u1',
        billing_month: '2026-04',
        used_usd: new Decimal('100'),
        request_count: 0, // not active
      }),
    ];
    const insights = trendInsights(current, zeroPreceding);
    const activeInsight = insights.find((i) => i.id === 'trend_active_users');
    expect(activeInsight).toBeUndefined();
  });

  it('omits requests insight when preceding total requests is zero (no placeholder)', () => {
    const zeroPreceding = [
      summary({
        user_id: 'u1',
        billing_month: '2026-04',
        used_usd: new Decimal('100'),
        request_count: 0,
      }),
    ];
    const insights = trendInsights(current, zeroPreceding);
    const requestsInsight = insights.find((i) => i.id === 'trend_requests');
    expect(requestsInsight).toBeUndefined();
  });

  it('no insight contains placeholder text like "N/A" or "unavailable"', () => {
    const insights = trendInsights(current, preceding);
    for (const insight of insights) {
      expect(insight.text).not.toContain('N/A');
      expect(insight.text).not.toContain('unavailable');
      expect(insight.text).not.toContain('placeholder');
      expect(insight.metricValue).not.toBe('N/A');
      expect(insight.metricValue).not.toBe('unavailable');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// topPerformers output shape (as Insights via the ranking structure)
// ─────────────────────────────────────────────────────────────────────────────

describe('topPerformers output shape (Req 15.4, 15.5)', () => {
  const summaries = [
    summary({
      user_id: 'u1',
      username: 'alice',
      used_usd: new Decimal('200'),
      request_count: 50,
      input_tokens: 1000,
      output_tokens: 500,
    }),
    summary({
      user_id: 'u2',
      username: 'bob',
      used_usd: new Decimal('100'),
      request_count: 80,
      input_tokens: 300,
      output_tokens: 200,
    }),
  ];

  it('returns a TopPerformerRanking with bySpend, byRequests, byTokens', () => {
    const result = topPerformers(summaries);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('bySpend');
    expect(result).toHaveProperty('byRequests');
    expect(result).toHaveProperty('byTokens');
  });

  it('each TopPerformerEntry has userId, label (non-empty string), and value', () => {
    const result = topPerformers(summaries)!;
    const entries = [result.bySpend, result.byRequests, result.byTokens];
    for (const entry of entries) {
      expect(entry).not.toBeNull();
      expect(entry!.userId).toBeDefined();
      expect(typeof entry!.userId).toBe('string');
      expect(entry!.userId.length).toBeGreaterThan(0);

      expect(entry!.label).toBeDefined();
      expect(typeof entry!.label).toBe('string');
      expect(entry!.label.length).toBeGreaterThan(0);

      expect(entry!.value).toBeDefined();
      expect(
        typeof entry!.value === 'number' || typeof entry!.value === 'string',
      ).toBe(true);
    }
  });

  it('value is a Decimal string for spend and a number for requests/tokens', () => {
    const result = topPerformers(summaries)!;
    // Spend value is a string (Decimal.toString())
    expect(typeof result.bySpend!.value).toBe('string');
    expect(Number.isNaN(Number(result.bySpend!.value))).toBe(false);

    // Requests and tokens are numbers
    expect(typeof result.byRequests!.value).toBe('number');
    expect(typeof result.byTokens!.value).toBe('number');
  });

  // --- Omission tests (Req 15.5): absent not placeholder ---

  it('returns null (not a placeholder object) when summaries are empty', () => {
    const result = topPerformers([]);
    expect(result).toBeNull();
  });

  it('returns null (not a placeholder object) when all users have zero metrics', () => {
    const zeroRecords = [
      summary({ user_id: 'u1', used_usd: new Decimal(0), request_count: 0 }),
      summary({ user_id: 'u2', used_usd: new Decimal(0), request_count: 0 }),
    ];
    const result = topPerformers(zeroRecords);
    expect(result).toBeNull();
  });

  it('individual metric is null (not placeholder) when all users are zero for that metric', () => {
    const onlySpend = [
      summary({
        user_id: 'u1',
        username: 'alice',
        used_usd: new Decimal('100'),
        request_count: 0,
        // no tokens
      }),
    ];
    const result = topPerformers(onlySpend);
    expect(result).not.toBeNull();
    expect(result!.bySpend).not.toBeNull();
    // Requests and tokens should be null (omitted), not placeholder
    expect(result!.byRequests).toBeNull();
    expect(result!.byTokens).toBeNull();
  });

  it('label never contains placeholder text', () => {
    const result = topPerformers(summaries)!;
    const entries = [result.bySpend, result.byRequests, result.byTokens];
    for (const entry of entries) {
      expect(entry!.label).not.toContain('N/A');
      expect(entry!.label).not.toContain('unavailable');
      expect(entry!.label).not.toContain('placeholder');
      expect(entry!.label).not.toBe('');
    }
  });
});
