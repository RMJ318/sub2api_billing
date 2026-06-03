import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { reconcileDailyToMonthly } from './index.js';
import type { DailyUsageRecord, MonthlySummaryRecord } from './index.js';

/**
 * Property 32: Daily records reconcile to the monthly summary.
 *
 * For any user and Billing_Month, the Daily_Usage_Records are associated with
 * the matching Monthly_Summary_Record by `user_id` and Billing_Month, and a
 * reconciliation discrepancy is recorded if and only if the sum of the daily
 * `used_usd` differs from the summary `used_usd` by more than 1 percent.
 *
 * The difference percentage is computed as:
 *   |dailySum - monthly| / |monthly| * 100
 *
 * Users with zero or null monthly `used_usd` are skipped (relative difference
 * is undefined).
 *
 * **Validates: Requirements 21.1, 21.2**
 */

// --- Generators ---

/** A user_id drawn from a small pool so some collisions occur. */
const arbUserId = fc.constantFrom('u1', 'u2', 'u3', 'u4', 'u5');

/** A billing_month in YYYY-MM format. */
const arbMonth = fc.constantFrom('2026-04', '2026-05', '2026-06');

/**
 * A positive money value (up to 6 fractional digits), representing non-zero
 * monthly summaries. We avoid zero here because zero monthly causes a skip.
 */
const arbPositiveMoney: fc.Arbitrary<Decimal> = fc
  .record({
    intPart: fc.integer({ min: 1, max: 99_999 }),
    frac: fc.integer({ min: 0, max: 999_999 }),
  })
  .map(({ intPart, frac }) => new Decimal(`${intPart}.${String(frac).padStart(6, '0')}`));

/**
 * A non-negative money value for daily records (including zero).
 */
const arbNonNegMoney: fc.Arbitrary<Decimal> = fc
  .record({
    intPart: fc.integer({ min: 0, max: 99_999 }),
    frac: fc.integer({ min: 0, max: 999_999 }),
  })
  .map(({ intPart, frac }) => new Decimal(`${intPart}.${String(frac).padStart(6, '0')}`));

/** Build a minimal DailyUsageRecord with the required fields. */
function makeDailyRecord(userId: string, month: string, usedUsd: Decimal | null): DailyUsageRecord {
  return {
    billing_month: month,
    usage_date: new Date('2026-04-01T00:00:00Z'),
    user_id: userId,
    email: null,
    username: null,
    request_count: null,
    used_usd: usedUsd,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
  };
}

/** Build a minimal MonthlySummaryRecord with the required fields. */
function makeSummaryRecord(userId: string, month: string, usedUsd: Decimal | null): MonthlySummaryRecord {
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
    used_usd: usedUsd,
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

describe('Property 32: Daily records reconcile to the monthly summary', () => {
  it('no discrepancy is flagged when daily sum matches monthly within 1%', () => {
    // Generate a positive monthly value and a daily sum that is within 1% of it.
    const arbScenario = fc
      .record({
        userId: arbUserId,
        month: arbMonth,
        monthlyValue: arbPositiveMoney,
        // Factor within [0.99, 1.01] — ensures diff <= 1%
        factorParts: fc.integer({ min: 9900, max: 10100 }),
      })
      .map(({ userId, month, monthlyValue, factorParts }) => {
        const factor = new Decimal(factorParts).dividedBy(10000);
        const dailyTotal = monthlyValue.times(factor);
        return { userId, month, monthlyValue, dailyTotal };
      });

    fc.assert(
      fc.property(arbScenario, ({ userId, month, monthlyValue, dailyTotal }) => {
        const daily = [makeDailyRecord(userId, month, dailyTotal)];
        const summary = [makeSummaryRecord(userId, month, monthlyValue)];

        const result = reconcileDailyToMonthly(daily, summary);

        // Verify: the absolute relative diff is <= 1%, so no discrepancy.
        const expectedDiffPercent = dailyTotal
          .minus(monthlyValue)
          .abs()
          .dividedBy(monthlyValue.abs())
          .times(100)
          .toNumber();

        if (expectedDiffPercent <= 1) {
          // Should not be flagged
          const userDisc = result.discrepancies.filter(
            (d) => d.userId === userId && d.month === month,
          );
          expect(userDisc).toHaveLength(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a discrepancy IS flagged when daily sum differs from monthly by more than 1%', () => {
    // Generate a positive monthly value and a daily sum that differs by more than 1%.
    const arbScenario = fc
      .record({
        userId: arbUserId,
        month: arbMonth,
        monthlyValue: arbPositiveMoney,
        // Factor outside [0.99, 1.01]: either < 0.99 or > 1.01
        factorChoice: fc.boolean(),
        offset: fc.integer({ min: 1, max: 5000 }),
      })
      .map(({ userId, month, monthlyValue, factorChoice, offset }) => {
        // Build a factor that guarantees > 1% difference.
        // If factorChoice=true, go below 0.99; if false, go above 1.01.
        const baseFactor = factorChoice
          ? new Decimal(9900 - offset).dividedBy(10000) // < 0.99
          : new Decimal(10100 + offset).dividedBy(10000); // > 1.01
        // Clamp factor to be non-negative to keep dailyTotal >= 0
        const factor = Decimal.max(baseFactor, new Decimal(0));
        const dailyTotal = monthlyValue.times(factor);
        return { userId, month, monthlyValue, dailyTotal };
      });

    fc.assert(
      fc.property(arbScenario, ({ userId, month, monthlyValue, dailyTotal }) => {
        const daily = [makeDailyRecord(userId, month, dailyTotal)];
        const summary = [makeSummaryRecord(userId, month, monthlyValue)];

        const result = reconcileDailyToMonthly(daily, summary);

        // Compute expected difference percentage
        const expectedDiffPercent = dailyTotal
          .minus(monthlyValue)
          .abs()
          .dividedBy(monthlyValue.abs())
          .times(100)
          .toNumber();

        if (expectedDiffPercent > 1) {
          // Should be flagged
          const userDisc = result.discrepancies.filter(
            (d) => d.userId === userId && d.month === month,
          );
          expect(userDisc).toHaveLength(1);
          // The difference percent in the result should match our calculation
          expect(userDisc[0].differencePercent).toBeCloseTo(expectedDiffPercent, 6);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the difference percentage is computed as |dailySum - monthly| / |monthly| * 100', () => {
    // Verify the exact formula for reported discrepancies.
    const arbScenario = fc
      .record({
        userId: arbUserId,
        month: arbMonth,
        monthlyValue: arbPositiveMoney,
        dailyValue: arbNonNegMoney,
      })
      .filter(({ monthlyValue, dailyValue }) => {
        // Filter to cases where there IS a discrepancy (> 1%)
        const diff = dailyValue.minus(monthlyValue).abs().dividedBy(monthlyValue.abs()).times(100);
        return diff.toNumber() > 1;
      });

    fc.assert(
      fc.property(arbScenario, ({ userId, month, monthlyValue, dailyValue }) => {
        const daily = [makeDailyRecord(userId, month, dailyValue)];
        const summary = [makeSummaryRecord(userId, month, monthlyValue)];

        const result = reconcileDailyToMonthly(daily, summary);

        expect(result.discrepancies).toHaveLength(1);
        const disc = result.discrepancies[0];

        // Verify formula: |dailySum - monthly| / |monthly| * 100
        const expectedPercent = dailyValue
          .minus(monthlyValue)
          .abs()
          .dividedBy(monthlyValue.abs())
          .times(100)
          .toNumber();

        expect(disc.differencePercent).toBeCloseTo(expectedPercent, 10);
        expect(disc.dailySumUsd.equals(dailyValue)).toBe(true);
        expect(disc.monthlySummaryUsd.equals(monthlyValue)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('users with zero or null monthly used_usd are skipped', () => {
    // Generate scenarios where monthly used_usd is zero or null — no discrepancy should be flagged.
    const arbScenario = fc
      .record({
        userId: arbUserId,
        month: arbMonth,
        dailyValue: arbNonNegMoney,
        useNull: fc.boolean(),
      })
      .map(({ userId, month, dailyValue, useNull }) => ({
        userId,
        month,
        dailyValue,
        monthlyValue: useNull ? null : new Decimal(0),
      }));

    fc.assert(
      fc.property(arbScenario, ({ userId, month, dailyValue, monthlyValue }) => {
        const daily = [makeDailyRecord(userId, month, dailyValue)];
        const summary = [makeSummaryRecord(userId, month, monthlyValue)];

        const result = reconcileDailyToMonthly(daily, summary);

        // No discrepancy should be reported for this user
        const userDisc = result.discrepancies.filter(
          (d) => d.userId === userId && d.month === month,
        );
        expect(userDisc).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
