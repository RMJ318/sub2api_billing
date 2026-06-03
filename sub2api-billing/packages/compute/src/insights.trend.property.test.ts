import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { trendInsights } from './insights.js';
import type { Insight } from './insights.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * Property 35: Trend insights match the computed change.
 *
 * For any pair of current and preceding Monthly_Summary_Record arrays,
 * `trendInsights` produces text describing the direction (increase/decrease)
 * and magnitude of change, the change percentage matches
 * (current - preceding) / preceding * 100, insights are omitted when
 * preceding values are zero, and insights are omitted when either dataset
 * is empty.
 *
 * **Validates: Requirements 15.3**
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

/**
 * Reference percentage change: (current - preceding) / preceding * 100.
 * Returns null when preceding is 0 (cannot compute relative change).
 */
function referencePctChange(current: number, preceding: number): number | null {
  if (preceding === 0) return null;
  return ((current - preceding) / preceding) * 100;
}

/**
 * Reference percentage change for Decimal values.
 */
function referencePctChangeDecimal(current: Decimal, preceding: Decimal): number | null {
  if (preceding.isZero()) return null;
  return current.minus(preceding).div(preceding).times(100).toNumber();
}

/**
 * Extract the numeric magnitude from an insight text like "Total spend increased by 50%".
 * The text format is: `${metric} ${direction} by ${magnitude}%`
 */
function extractMagnitude(text: string): number {
  const match = text.match(/by ([\d.]+)%/);
  if (!match) throw new Error(`Could not extract magnitude from: "${text}"`);
  return parseFloat(match[1]);
}

/**
 * Extract the direction from an insight text.
 */
function extractDirection(text: string): 'increased' | 'decreased' {
  if (text.includes('increased')) return 'increased';
  if (text.includes('decreased')) return 'decreased';
  throw new Error(`Could not extract direction from: "${text}"`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Non-negative monetary value as a number suitable for Decimal conversion.
 * Uses a minimum of 0.000001 to match the data's 6 fractional-digit precision.
 */
const moneyArb = fc.oneof(
  fc.constant(0),
  fc.double({ min: 0.000001, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
);

/** Non-negative monetary value that is strictly positive. */
const positiveMoneyArb = fc.double({
  min: 0.000001,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Non-negative integer count (request_count). */
const countArb = fc.integer({ min: 0, max: 100_000 });

/** Strictly positive integer count. */
const positiveCountArb = fc.integer({ min: 1, max: 100_000 });

/**
 * Arbitrary that generates a list of summaries with configurable user activity.
 * Each user has a spend, request_count, and is marked active or inactive.
 */
const summariesArb = (billing_month: string) =>
  fc.array(
    fc.record({
      spend: moneyArb,
      requestCount: countArb,
    }),
    { minLength: 1, maxLength: 10 },
  ).map((users) =>
    users.map((u, i) =>
      summary({
        user_id: `u${i}`,
        billing_month,
        used_usd: new Decimal(u.spend),
        request_count: u.requestCount,
      }),
    ),
  );

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 35: Trend insights match the computed change', () => {
  it('insights are omitted when current dataset is empty', () => {
    fc.assert(
      fc.property(summariesArb('2026-04'), (preceding) => {
        const insights = trendInsights([], preceding);
        expect(insights).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('insights are omitted when preceding dataset is empty', () => {
    fc.assert(
      fc.property(summariesArb('2026-05'), (current) => {
        const insights = trendInsights(current, []);
        expect(insights).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('spend insight direction matches sign of change and magnitude matches formula', () => {
    fc.assert(
      fc.property(positiveMoneyArb, positiveMoneyArb, (currentSpend, precedingSpend) => {
        const current = [summary({ user_id: 'u1', used_usd: new Decimal(currentSpend), request_count: 1 })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal(precedingSpend), request_count: 1 }),
        ];

        const insights = trendInsights(current, preceding);
        const spendInsight = insights.find((i) => i.id === 'trend_spend');

        // Preceding is non-zero, so spend insight must be present
        expect(spendInsight).toBeDefined();

        const expectedPct = referencePctChangeDecimal(
          new Decimal(currentSpend),
          new Decimal(precedingSpend),
        )!;

        // Direction matches the sign of change
        const direction = extractDirection(spendInsight!.text);
        if (expectedPct >= 0) {
          expect(direction).toBe('increased');
        } else {
          expect(direction).toBe('decreased');
        }

        // Magnitude matches abs(rounded pct)
        const magnitude = extractMagnitude(spendInsight!.text);
        const expectedMagnitude = Math.abs(Math.round(expectedPct * 10) / 10);
        expect(magnitude).toBeCloseTo(expectedMagnitude, 1);
      }),
      { numRuns: 200 },
    );
  });

  it('spend insight is omitted when preceding spend is zero', () => {
    fc.assert(
      fc.property(positiveMoneyArb, (currentSpend) => {
        const current = [summary({ user_id: 'u1', used_usd: new Decimal(currentSpend), request_count: 1 })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal(0), request_count: 1 }),
        ];

        const insights = trendInsights(current, preceding);
        const spendInsight = insights.find((i) => i.id === 'trend_spend');

        // Preceding spend is zero → insight is omitted
        expect(spendInsight).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('active users insight direction matches sign of change and magnitude matches formula', () => {
    // Generate varying active user counts via different user lists
    const usersArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 15 });

    fc.assert(
      fc.property(usersArb, usersArb, (currentActivity, precedingActivity) => {
        const currentActiveCount = currentActivity.filter(Boolean).length;
        const precedingActiveCount = precedingActivity.filter(Boolean).length;

        // Skip cases where preceding active count is 0 (those are tested separately)
        if (precedingActiveCount === 0) return;

        const current = currentActivity.map((active, i) =>
          summary({ user_id: `u${i}`, request_count: active ? 1 : 0, used_usd: new Decimal(1) }),
        );
        const preceding = precedingActivity.map((active, i) =>
          summary({
            user_id: `u${i}`,
            billing_month: '2026-04',
            request_count: active ? 1 : 0,
            used_usd: new Decimal(1),
          }),
        );

        const insights = trendInsights(current, preceding);
        const activeInsight = insights.find((i) => i.id === 'trend_active_users');

        expect(activeInsight).toBeDefined();

        const expectedPct = referencePctChange(currentActiveCount, precedingActiveCount)!;
        const direction = extractDirection(activeInsight!.text);
        if (expectedPct >= 0) {
          expect(direction).toBe('increased');
        } else {
          expect(direction).toBe('decreased');
        }

        const magnitude = extractMagnitude(activeInsight!.text);
        const expectedMagnitude = Math.abs(Math.round(expectedPct * 10) / 10);
        expect(magnitude).toBeCloseTo(expectedMagnitude, 1);

        // Supporting metric value is the current active user count
        expect(activeInsight!.metricValue).toBe(currentActiveCount);
      }),
      { numRuns: 200 },
    );
  });

  it('active users insight is omitted when preceding active users is zero', () => {
    fc.assert(
      fc.property(positiveCountArb, (currentRequests) => {
        const current = [summary({ user_id: 'u1', request_count: currentRequests, used_usd: new Decimal(1) })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', request_count: 0, used_usd: new Decimal(1) }),
        ];

        const insights = trendInsights(current, preceding);
        const activeInsight = insights.find((i) => i.id === 'trend_active_users');

        // Preceding active count is 0 → insight is omitted
        expect(activeInsight).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('requests insight direction matches sign of change and magnitude matches formula', () => {
    fc.assert(
      fc.property(positiveCountArb, positiveCountArb, (currentRequests, precedingRequests) => {
        const current = [summary({ user_id: 'u1', request_count: currentRequests, used_usd: new Decimal(1) })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', request_count: precedingRequests, used_usd: new Decimal(1) }),
        ];

        const insights = trendInsights(current, preceding);
        const requestsInsight = insights.find((i) => i.id === 'trend_requests');

        expect(requestsInsight).toBeDefined();

        const expectedPct = referencePctChange(currentRequests, precedingRequests)!;
        const direction = extractDirection(requestsInsight!.text);
        if (expectedPct >= 0) {
          expect(direction).toBe('increased');
        } else {
          expect(direction).toBe('decreased');
        }

        const magnitude = extractMagnitude(requestsInsight!.text);
        const expectedMagnitude = Math.abs(Math.round(expectedPct * 10) / 10);
        expect(magnitude).toBeCloseTo(expectedMagnitude, 1);

        // Supporting metric value is the current total request count
        expect(requestsInsight!.metricValue).toBe(currentRequests);
      }),
      { numRuns: 200 },
    );
  });

  it('requests insight is omitted when preceding requests is zero', () => {
    fc.assert(
      fc.property(positiveCountArb, (currentRequests) => {
        const current = [summary({ user_id: 'u1', request_count: currentRequests, used_usd: new Decimal(1) })];
        const preceding = [
          summary({ user_id: 'u1', billing_month: '2026-04', request_count: 0, used_usd: new Decimal(1) }),
        ];

        const insights = trendInsights(current, preceding);
        const requestsInsight = insights.find((i) => i.id === 'trend_requests');

        // Preceding requests is 0 → insight is omitted
        expect(requestsInsight).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('change percentage matches (current - preceding) / preceding * 100 across all three metrics', () => {
    fc.assert(
      fc.property(
        positiveMoneyArb,
        positiveMoneyArb,
        positiveCountArb,
        positiveCountArb,
        (curSpend, precSpend, curReqs, precReqs) => {
          const current = [
            summary({ user_id: 'u1', used_usd: new Decimal(curSpend), request_count: curReqs }),
          ];
          const preceding = [
            summary({
              user_id: 'u1',
              billing_month: '2026-04',
              used_usd: new Decimal(precSpend),
              request_count: precReqs,
            }),
          ];

          const insights = trendInsights(current, preceding);

          // All three insights should be present (all preceding values non-zero)
          expect(insights.length).toBe(3);

          for (const insight of insights) {
            expect(insight.kind).toBe('trend');

            let expectedPct: number;
            if (insight.id === 'trend_spend') {
              expectedPct = referencePctChangeDecimal(new Decimal(curSpend), new Decimal(precSpend))!;
            } else if (insight.id === 'trend_active_users') {
              // Both current and preceding have 1 active user → 0% change
              expectedPct = referencePctChange(1, 1)!;
            } else {
              expectedPct = referencePctChange(curReqs, precReqs)!;
            }

            const magnitude = extractMagnitude(insight.text);
            const expectedMagnitude = Math.abs(Math.round(expectedPct * 10) / 10);
            expect(magnitude).toBeCloseTo(expectedMagnitude, 1);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
