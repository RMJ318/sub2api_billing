import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { forecastMonthEnd, isInsufficientData } from './index.js';
import type { DailyUsageRecord } from './index.js';

/**
 * Property 29: Month-end forecast extrapolates the daily rate.
 *
 * For any set of Daily_Usage_Records spanning at least 3 distinct days within a
 * Billing_Month, the projected month-end Spend equals the observed cumulative
 * Spend plus the average daily Spend multiplied by the number of remaining days
 * in the month (equivalently: averageDailySpend × daysInMonth), the projected
 * days-to-budget equals the remaining aggregate budget divided by the average
 * daily Spend, and the over-budget indicator is set exactly when the projected
 * month-end Spend exceeds the aggregate Monthly_Budget_Limit.
 *
 * **Validates: Requirements 14.2, 14.3, 14.4**
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Valid YYYY-MM months (kept to a reasonable range). */
const monthArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
  })
  .map(({ year, month }) => `${year}-${String(month).padStart(2, '0')}`);

/** Number of calendar days in a YYYY-MM month. */
function daysInMonth(month: string): number {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNumber = Number(monthStr);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

/** Generate a set of at least `minDays` distinct day numbers within a month. */
function distinctDaysArb(month: string, minDays: number) {
  const totalDays = daysInMonth(month);
  return fc
    .uniqueArray(fc.integer({ min: 1, max: totalDays }), { minLength: minDays, maxLength: totalDays })
    .filter((arr) => arr.length >= minDays);
}

/**
 * A non-negative decimal Spend value (up to 6 fractional digits, moderate magnitude).
 * Null is also possible to exercise the null-Spend path.
 */
const spendArb: fc.Arbitrary<Decimal | null> = fc.oneof(
  fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }).map(
    (v) => new Decimal(v.toFixed(6)),
  ),
  fc.constant(null),
);

/** A positive budget value. */
const budgetArb = fc
  .double({ min: 0.01, max: 10_000_000, noNaN: true, noDefaultInfinity: true })
  .map((v) => new Decimal(v.toFixed(6)));

/** Build a DailyUsageRecord for the given month and day with a given Spend. */
function makeDailyRecord(month: string, day: number, usedUsd: Decimal | null): DailyUsageRecord {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNumber = Number(monthStr);
  return {
    billing_month: month,
    usage_date: new Date(Date.UTC(year, monthNumber - 1, day)),
    user_id: 'u1',
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

/**
 * Generate a valid forecast scenario: a month, at least 3 distinct days of
 * daily records (possibly multiple records per day), and a budget.
 */
interface ForecastScenario {
  month: string;
  daily: DailyUsageRecord[];
  budget: Decimal;
}

const scenarioArb: fc.Arbitrary<ForecastScenario> = monthArb.chain((month) => {
  const days = daysInMonth(month);
  return fc
    .tuple(
      distinctDaysArb(month, 3),
      budgetArb,
    )
    .chain(([distinctDayNumbers, budget]) =>
      // For each distinct day, generate 1-3 records (multiple users per day).
      fc
        .tuple(
          ...distinctDayNumbers.map((day) =>
            fc.array(spendArb, { minLength: 1, maxLength: 3 }).map((spends) =>
              spends.map((spend) => makeDailyRecord(month, day, spend)),
            ),
          ),
        )
        .map((recordGroups) => ({
          month,
          daily: recordGroups.flat(),
          budget,
        })),
    );
});

/**
 * Generate an insufficient-data scenario: fewer than 3 distinct days.
 */
const insufficientScenarioArb: fc.Arbitrary<ForecastScenario> = monthArb.chain((month) => {
  const days = daysInMonth(month);
  // 0, 1, or 2 distinct days
  return fc
    .tuple(
      fc.uniqueArray(fc.integer({ min: 1, max: days }), { minLength: 0, maxLength: 2 }),
      budgetArb,
    )
    .chain(([distinctDayNumbers, budget]) => {
      if (distinctDayNumbers.length === 0) {
        return fc.constant({ month, daily: [] as DailyUsageRecord[], budget });
      }
      return fc
        .tuple(
          ...distinctDayNumbers.map((day) =>
            fc.array(spendArb, { minLength: 1, maxLength: 3 }).map((spends) =>
              spends.map((spend) => makeDailyRecord(month, day, spend)),
            ),
          ),
        )
        .map((recordGroups) => ({
          month,
          daily: recordGroups.flat(),
          budget,
        }));
    });
});

// ---------------------------------------------------------------------------
// Reference computation
// ---------------------------------------------------------------------------

function referenceForecast(daily: readonly DailyUsageRecord[], month: string, budget: Decimal) {
  // Count distinct days and cumulative spend.
  const distinctDays = new Set<string>();
  let cumulativeSpend = new Decimal(0);
  for (const r of daily) {
    const d = r.usage_date;
    distinctDays.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
    if (r.used_usd !== null) {
      cumulativeSpend = cumulativeSpend.plus(r.used_usd);
    }
  }
  const observedDays = distinctDays.size;
  const monthDays = daysInMonth(month);
  const averageDailySpend = cumulativeSpend.div(observedDays);
  const projectedMonthEndSpend = averageDailySpend.times(monthDays);
  const remainingBudget = budget.minus(cumulativeSpend);
  const projectedDaysToBudget = averageDailySpend.isZero()
    ? Infinity
    : remainingBudget.div(averageDailySpend).toNumber();
  const overBudget = projectedMonthEndSpend.greaterThan(budget);
  return { projectedMonthEndSpend, projectedDaysToBudget, overBudget };
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 29: Month-end forecast extrapolates the daily rate', () => {
  it('projectedMonthEndSpend equals averageDailySpend × daysInMonth (Req 14.2)', () => {
    fc.assert(
      fc.property(scenarioArb, ({ month, daily, budget }) => {
        const result = forecastMonthEnd(daily, month, budget);
        expect(isInsufficientData(result)).toBe(false);
        if (isInsufficientData(result)) return;

        const ref = referenceForecast(daily, month, budget);
        // The implementation uses cumulative + avg*(remaining), which is equivalent to avg*daysInMonth.
        // Compare with a tight tolerance for decimal precision.
        const diff = result.projectedMonthEndSpendUsd.minus(ref.projectedMonthEndSpend).abs();
        const tolerance = new Decimal('0.000001');
        expect(diff.lte(tolerance)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('projectedDaysToBudget equals (budget - cumulativeSpend) / averageDailySpend (Req 14.3)', () => {
    fc.assert(
      fc.property(scenarioArb, ({ month, daily, budget }) => {
        const result = forecastMonthEnd(daily, month, budget);
        if (isInsufficientData(result)) return;

        const ref = referenceForecast(daily, month, budget);
        if (ref.projectedDaysToBudget === Infinity) {
          expect(result.projectedDaysToBudget).toBe(Infinity);
        } else {
          const diff = Math.abs(result.projectedDaysToBudget - ref.projectedDaysToBudget);
          const tolerance = 1e-6 * Math.max(1, Math.abs(ref.projectedDaysToBudget));
          expect(diff).toBeLessThanOrEqual(tolerance);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('overBudget is true exactly when projectedMonthEndSpend > budget (Req 14.4)', () => {
    fc.assert(
      fc.property(scenarioArb, ({ month, daily, budget }) => {
        const result = forecastMonthEnd(daily, month, budget);
        if (isInsufficientData(result)) return;

        const ref = referenceForecast(daily, month, budget);
        expect(result.overBudget).toBe(ref.overBudget);
      }),
      { numRuns: 200 },
    );
  });

  it('returns InsufficientData when fewer than 3 distinct days exist (Req 14.5)', () => {
    fc.assert(
      fc.property(insufficientScenarioArb, ({ month, daily, budget }) => {
        const result = forecastMonthEnd(daily, month, budget);
        expect(isInsufficientData(result)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
