import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { computeDashboardKpis } from './index.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * Property 14: Budget usage rate equals the bounded, rounded ratio.
 *
 * For any set of Monthly_Summary_Records, the monthly budget usage rate equals
 * total Spend (`sum(used_usd)`) divided by the sum of `monthly_limit_usd`,
 * times 100, rounded to one decimal place. When the sum of `monthly_limit_usd`
 * is 0, the rate is 0 (not infinity/NaN). The rate is bounded [0, ∞) — it can
 * exceed 100% if spend exceeds the limit.
 *
 * **Validates: Requirements 4.8, 4.9**
 */

/** Build a minimal MonthlySummaryRecord with only the fields relevant to budget. */
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
 * Arbitrary for non-negative monetary values. We use integer cents scaled to
 * up to 6 decimal places to mimic realistic billing amounts while remaining
 * precise in the reference computation.
 */
const moneyArb = fc.integer({ min: 0, max: 10_000_000 }).map(
  (cents) => new Decimal(cents).div(100),
);

/**
 * Arbitrary for a budget-relevant record: carries `used_usd` and
 * `monthly_limit_usd` — the only fields affecting budget usage rate.
 */
const budgetRecordArb: fc.Arbitrary<MonthlySummaryRecord> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 5 }), // user_id
    moneyArb, // used_usd
    moneyArb, // monthly_limit_usd
  )
  .map(([userId, used, limit]) =>
    summary({ user_id: userId, used_usd: used, monthly_limit_usd: limit }),
  );

/**
 * Reference implementation: compute the budget usage rate independently.
 * rate = sum(used_usd) / sum(monthly_limit_usd) * 100, rounded to 1 dp.
 * Returns 0 when the limit sum is 0.
 */
function referenceBudgetRate(records: readonly MonthlySummaryRecord[]): number {
  let usedSum = new Decimal(0);
  let limitSum = new Decimal(0);
  for (const r of records) {
    usedSum = usedSum.plus(r.used_usd ?? new Decimal(0));
    limitSum = limitSum.plus(r.monthly_limit_usd ?? new Decimal(0));
  }
  if (limitSum.isZero()) return 0;
  return usedSum.div(limitSum).times(100).toDecimalPlaces(1).toNumber();
}

describe('Property 14: Budget usage rate equals the bounded, rounded ratio', () => {
  it('equals sum(used_usd) / sum(monthly_limit_usd) * 100 rounded to 1 dp', () => {
    fc.assert(
      fc.property(fc.array(budgetRecordArb, { minLength: 1, maxLength: 20 }), (records) => {
        const kpis = computeDashboardKpis(records);
        const expected = referenceBudgetRate(records);
        expect(kpis.budgetUsageRatePct).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('returns 0 when the sum of monthly_limit_usd is 0 (not Infinity or NaN)', () => {
    // Generate records where all limits are explicitly zero.
    const zeroLimitRecordArb = fc
      .tuple(
        fc.string({ minLength: 1, maxLength: 5 }), // user_id
        moneyArb, // used_usd (can be anything)
      )
      .map(([userId, used]) =>
        summary({ user_id: userId, used_usd: used, monthly_limit_usd: new Decimal(0) }),
      );

    fc.assert(
      fc.property(fc.array(zeroLimitRecordArb, { minLength: 1, maxLength: 10 }), (records) => {
        const kpis = computeDashboardKpis(records);
        expect(kpis.budgetUsageRatePct).toBe(0);
        expect(Number.isFinite(kpis.budgetUsageRatePct)).toBe(true);
        expect(Number.isNaN(kpis.budgetUsageRatePct)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('is bounded at [0, ∞) and can exceed 100% when spend exceeds limit', () => {
    // Generate records where used_usd > monthly_limit_usd to ensure rate > 100%.
    const overBudgetRecordArb = fc
      .tuple(
        fc.string({ minLength: 1, maxLength: 5 }), // user_id
        fc.integer({ min: 1, max: 10_000 }), // limit (positive)
        fc.integer({ min: 1, max: 10_000 }), // extra spend above limit
      )
      .map(([userId, limitCents, extraCents]) => {
        const limit = new Decimal(limitCents).div(100);
        const used = limit.plus(new Decimal(extraCents).div(100)); // spend > limit
        return summary({ user_id: userId, used_usd: used, monthly_limit_usd: limit });
      });

    fc.assert(
      fc.property(fc.array(overBudgetRecordArb, { minLength: 1, maxLength: 10 }), (records) => {
        const kpis = computeDashboardKpis(records);
        // Rate must be > 100% since every record has spend > limit.
        expect(kpis.budgetUsageRatePct).toBeGreaterThan(100);
        // Must be a finite, non-negative number.
        expect(kpis.budgetUsageRatePct).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(kpis.budgetUsageRatePct)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('the rate is always non-negative for non-negative inputs', () => {
    fc.assert(
      fc.property(fc.array(budgetRecordArb, { minLength: 0, maxLength: 20 }), (records) => {
        const kpis = computeDashboardKpis(records);
        expect(kpis.budgetUsageRatePct).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(kpis.budgetUsageRatePct)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
