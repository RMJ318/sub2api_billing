import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { computeDashboardKpis } from './index.js';
import type { KpiChange, KpiComparison } from './index.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * Property 15: KPI percentage change equals relative delta or signals no comparison.
 *
 * For any current and preceding KPI value, the displayed change equals
 * (current - preceding) / preceding * 100 when the preceding value is non-zero,
 * and is the no-comparison indicator when the preceding value is 0.
 *
 * **Validates: Requirements 4.10**
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

/**
 * Reference percentage change: (current - preceding) / preceding * 100.
 * Returns null when preceding is 0 (no-comparison indicator).
 */
function referenceChangePct(current: number, preceding: number): number | null {
  if (preceding === 0) return null;
  return ((current - preceding) / preceding) * 100;
}

/**
 * Assert a KpiChange matches the expected formula or no-comparison indicator.
 * Uses a relative tolerance plus a small absolute floor to absorb float drift
 * that appears at extreme magnitude ratios between Decimal (implementation) and
 * Number (reference) arithmetic.
 */
function assertKpiChange(change: KpiChange, current: number, preceding: number): void {
  const expected = referenceChangePct(current, preceding);
  if (expected === null) {
    expect(change).toEqual({ comparable: false });
  } else {
    expect(change.comparable).toBe(true);
    if (change.comparable) {
      // The implementation uses Decimal arithmetic while our reference uses
      // native Number; for very large or very small ratios there is acceptable
      // divergence. A relative tolerance of 1e-6 with an absolute floor handles
      // cases where the expected percentage is huge (extreme ratios).
      const tolerance = Math.max(1e-6, 1e-6 * Math.abs(expected));
      expect(Math.abs(change.changePct - expected)).toBeLessThanOrEqual(tolerance);
    }
  }
}

/**
 * Arbitrary for a non-negative integer value (simulating counts like
 * request_count, api_key_count, token counts).
 */
const countArb = fc.integer({ min: 0, max: 100_000 });

/**
 * Arbitrary for a non-negative monetary value (USD) as a Decimal-compatible number.
 * The minimum non-zero value is 0.000001 (1 micro-cent), matching the data's
 * 6 fractional-digit precision and avoiding subnormal doubles that cause float
 * vs. Decimal divergence unrelated to the property under test.
 */
const moneyArb = fc.oneof(
  fc.constant(0),
  fc.double({ min: 0.000001, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
);

/**
 * Arbitrary for a non-negative duration in ms (avg_duration_ms).
 */
const durationArb = fc.oneof(
  fc.constant(0),
  fc.double({ min: 0.001, max: 100_000, noNaN: true, noDefaultInfinity: true }),
);

describe('Property 15: KPI percentage change equals relative delta or signals no comparison', () => {
  it('totalSpendUsd change follows (current - preceding) / preceding * 100 or no-comparison', () => {
    fc.assert(
      fc.property(moneyArb, moneyArb, (currentSpend, precedingSpend) => {
        const current = [summary({ user_id: 'u1', used_usd: new Decimal(currentSpend) })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal(precedingSpend) }),
        ];

        const kpis = computeDashboardKpis(current, preceding);
        const comparison = kpis.comparison as KpiComparison;
        expect(comparison).toBeDefined();

        assertKpiChange(comparison.totalSpendUsd, currentSpend, precedingSpend);
      }),
      { numRuns: 200 },
    );
  });

  it('totalRequestCount change follows (current - preceding) / preceding * 100 or no-comparison', () => {
    fc.assert(
      fc.property(countArb, countArb, (currentCount, precedingCount) => {
        const current = [summary({ user_id: 'u1', request_count: currentCount })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', request_count: precedingCount }),
        ];

        const kpis = computeDashboardKpis(current, preceding);
        const comparison = kpis.comparison as KpiComparison;
        expect(comparison).toBeDefined();

        assertKpiChange(comparison.totalRequestCount, currentCount, precedingCount);
      }),
      { numRuns: 200 },
    );
  });

  it('activeUserCount change follows (current - preceding) / preceding * 100 or no-comparison', () => {
    // Active users are those with request_count >= 1. Generate a list of users
    // with varying activity to produce different active user counts.
    const usersArb = fc.array(
      fc.record({ active: fc.boolean() }),
      { minLength: 0, maxLength: 20 },
    );

    fc.assert(
      fc.property(usersArb, usersArb, (currentUsers, precedingUsers) => {
        const current = currentUsers.map((u, i) =>
          summary({ user_id: `u${i}`, request_count: u.active ? 1 : 0 }),
        );
        const preceding = precedingUsers.map((u, i) =>
          summary({ user_id: `u${i}`, billing_month: '2026-04', request_count: u.active ? 1 : 0 }),
        );

        const kpis = computeDashboardKpis(current, preceding);
        const comparison = kpis.comparison as KpiComparison;
        expect(comparison).toBeDefined();

        const currentActive = currentUsers.filter((u) => u.active).length;
        const precedingActive = precedingUsers.filter((u) => u.active).length;
        assertKpiChange(comparison.activeUserCount, currentActive, precedingActive);
      }),
      { numRuns: 200 },
    );
  });

  it('totalTokenCount change follows (current - preceding) / preceding * 100 or no-comparison', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (curTokens, precTokens, curTokens2, precTokens2) => {
        const current = [summary({ user_id: 'u1', input_tokens: curTokens, output_tokens: curTokens2 })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', input_tokens: precTokens, output_tokens: precTokens2 }),
        ];

        const kpis = computeDashboardKpis(current, preceding);
        const comparison = kpis.comparison as KpiComparison;
        expect(comparison).toBeDefined();

        const currentTotal = curTokens + curTokens2;
        const precedingTotal = precTokens + precTokens2;
        assertKpiChange(comparison.totalTokenCount, currentTotal, precedingTotal);
      }),
      { numRuns: 200 },
    );
  });

  it('signals no-comparison (comparable: false) when every preceding KPI is zero', () => {
    fc.assert(
      fc.property(moneyArb, countArb, (currentSpend, currentRequests) => {
        // Preceding records have all-zero/null metrics → preceding KPI values are 0
        const current = [
          summary({ user_id: 'u1', used_usd: new Decimal(currentSpend), request_count: currentRequests }),
        ];
        const preceding = [summary({ user_id: 'u1', billing_month: '2026-04' })];

        const kpis = computeDashboardKpis(current, preceding);
        const comparison = kpis.comparison as KpiComparison;
        expect(comparison).toBeDefined();

        // All preceding values are 0 → all comparisons should be no-comparison
        expect(comparison.totalSpendUsd).toEqual({ comparable: false });
        expect(comparison.activeUserCount).toEqual({ comparable: false });
        expect(comparison.totalRequestCount).toEqual({ comparable: false });
        expect(comparison.totalTokenCount).toEqual({ comparable: false });
        expect(comparison.totalApiKeyCount).toEqual({ comparable: false });
        expect(comparison.avgResponseMs).toEqual({ comparable: false });
        expect(comparison.budgetUsageRatePct).toEqual({ comparable: false });
      }),
      { numRuns: 100 },
    );
  });

  it('change can be positive (growth) when current > preceding', () => {
    // Generate pairs where current is strictly greater than preceding (both non-zero)
    const growthArb = fc.tuple(
      fc.double({ min: 1, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 1, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
    ).filter(([c, p]) => c > p);

    fc.assert(
      fc.property(growthArb, ([currentSpend, precedingSpend]) => {
        const current = [summary({ user_id: 'u1', used_usd: new Decimal(currentSpend) })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal(precedingSpend) }),
        ];

        const kpis = computeDashboardKpis(current, preceding);
        const comparison = kpis.comparison as KpiComparison;
        expect(comparison.totalSpendUsd.comparable).toBe(true);
        if (comparison.totalSpendUsd.comparable) {
          expect(comparison.totalSpendUsd.changePct).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('change can be negative (decline) when current < preceding', () => {
    // Generate pairs where current is strictly less than preceding (both non-zero)
    const declineArb = fc.tuple(
      fc.double({ min: 1, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 1, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
    ).filter(([c, p]) => c < p);

    fc.assert(
      fc.property(declineArb, ([currentSpend, precedingSpend]) => {
        const current = [summary({ user_id: 'u1', used_usd: new Decimal(currentSpend) })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal(precedingSpend) }),
        ];

        const kpis = computeDashboardKpis(current, preceding);
        const comparison = kpis.comparison as KpiComparison;
        expect(comparison.totalSpendUsd.comparable).toBe(true);
        if (comparison.totalSpendUsd.comparable) {
          expect(comparison.totalSpendUsd.changePct).toBeLessThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
