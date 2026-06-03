import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { detectRiskHint } from './signals.js';
import type { DailyUsageRecord, MonthlySummaryRecord } from './types/index.js';

/**
 * Property 40: Risk hints trigger on consecutive high-spend days.
 *
 * For any user's sequence of daily high-spend determinations within a
 * Billing_Month, a risk hint is produced if and only if there exist 2 or more
 * consecutive high-spend days. No risk hint is emitted for a single
 * high-spend day or non-consecutive high-spend days.
 *
 * Each emitted signal has group='risk_hint' and severity='critical'.
 *
 * **Validates: Requirements 17.5**
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = new Decimal('1000');

function makeSummary(
  userId: string,
  limit: Decimal = DEFAULT_LIMIT,
): MonthlySummaryRecord {
  return {
    billing_month: '2026-05',
    user_id: userId,
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: limit,
    used_usd: new Decimal('500'),
    remaining_monthly_limit_usd: new Decimal('500'),
    usage_percent: 50,
    request_count: 100,
    api_key_count: 2,
    active_days: 10,
    input_tokens: 1000,
    output_tokens: 500,
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
    avg_duration_ms: 3000,
    avg_first_token_ms: null,
    first_request_at: null,
    last_request_at: null,
  };
}

function makeDaily(
  userId: string,
  dayOfMonth: number,
  usedUsd: Decimal,
): DailyUsageRecord {
  return {
    billing_month: '2026-05',
    usage_date: new Date(Date.UTC(2026, 4, dayOfMonth)), // May = month 4
    user_id: userId,
    email: null,
    username: null,
    request_count: 10,
    used_usd: usedUsd,
    input_tokens: 100,
    output_tokens: 50,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: 2000,
  };
}

// ─── Generators ─────────────────────────────────────────────────────────────

/**
 * Generate a positive monthly limit (between 100 and 10000).
 */
const arbLimit = fc.integer({ min: 100, max: 10000 }).map((v) => new Decimal(v));

/**
 * Generate a sequence of daily spend amounts for days 1..N of a month.
 * Each entry is a tuple [dayOfMonth, spendAmount].
 * `highSpendFraction` controls how much above the threshold a high-spend day is.
 */
function arbDailySequence(limit: Decimal) {
  const threshold = limit.mul(0.2); // 20% of limit

  // Generate an array of booleans indicating whether each day is high-spend
  return fc
    .array(fc.boolean(), { minLength: 1, maxLength: 28 })
    .chain((isHighSpendDays) => {
      // For each day, generate a spend amount either above or below threshold
      const spendArbs = isHighSpendDays.map((isHigh) => {
        if (isHigh) {
          // Spend strictly above threshold
          const minAbove = threshold.add(0.01).toNumber();
          const maxAbove = limit.toNumber();
          return fc
            .double({ min: minAbove, max: maxAbove, noNaN: true })
            .map((v) => new Decimal(v.toFixed(2)));
        } else {
          // Spend at or below threshold (not triggering high-spend)
          const maxBelow = threshold.toNumber();
          return fc
            .double({ min: 0, max: maxBelow, noNaN: true })
            .map((v) => new Decimal(v.toFixed(2)));
        }
      });
      return fc.tuple(...spendArbs).map((spends) =>
        spends.map((spend, i) => ({
          dayOfMonth: i + 1,
          spend,
          isHighSpend: isHighSpendDays[i]!,
        })),
      );
    });
}

/**
 * Compute the longest consecutive run of high-spend days in a boolean sequence.
 * Returns whether there are >= 2 consecutive high-spend days.
 */
function hasConsecutiveHighSpend(isHighSpendDays: boolean[]): boolean {
  let consecutive = 0;
  for (const isHigh of isHighSpendDays) {
    if (isHigh) {
      consecutive++;
      if (consecutive >= 2) return true;
    } else {
      consecutive = 0;
    }
  }
  return false;
}

/**
 * Count the number of qualifying consecutive runs (each run of >= 2).
 */
function countConsecutiveRuns(isHighSpendDays: boolean[]): number {
  let runs = 0;
  let consecutive = 0;
  for (const isHigh of isHighSpendDays) {
    if (isHigh) {
      consecutive++;
    } else {
      if (consecutive >= 2) runs++;
      consecutive = 0;
    }
  }
  if (consecutive >= 2) runs++;
  return runs;
}

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property 40: Risk hints trigger on consecutive high-spend days', () => {
  it('emits a risk hint if and only if there are >= 2 consecutive high-spend days', () => {
    fc.assert(
      fc.property(arbLimit, (limit) => {
        return fc.assert(
          fc.property(arbDailySequence(limit), (days) => {
            const userId = 'user-test';
            const summaries = [makeSummary(userId, limit)];
            const daily = days.map((d) =>
              makeDaily(userId, d.dayOfMonth, d.spend),
            );

            const signals = detectRiskHint(daily, summaries);

            const isHighSpendFlags = days.map((d) => d.isHighSpend);
            const expectRiskHint = hasConsecutiveHighSpend(isHighSpendFlags);

            if (expectRiskHint) {
              expect(signals.length).toBeGreaterThanOrEqual(1);
            } else {
              expect(signals).toHaveLength(0);
            }
          }),
          { numRuns: 50 },
        );
      }),
      { numRuns: 10 },
    );
  });

  it('produces exactly one risk hint per qualifying consecutive run', () => {
    fc.assert(
      fc.property(arbLimit, (limit) => {
        return fc.assert(
          fc.property(arbDailySequence(limit), (days) => {
            const userId = 'user-test';
            const summaries = [makeSummary(userId, limit)];
            const daily = days.map((d) =>
              makeDaily(userId, d.dayOfMonth, d.spend),
            );

            const signals = detectRiskHint(daily, summaries);

            const isHighSpendFlags = days.map((d) => d.isHighSpend);
            const expectedRuns = countConsecutiveRuns(isHighSpendFlags);

            expect(signals).toHaveLength(expectedRuns);
          }),
          { numRuns: 50 },
        );
      }),
      { numRuns: 10 },
    );
  });

  it('every emitted signal has group="risk_hint" and severity="critical"', () => {
    fc.assert(
      fc.property(arbLimit, (limit) => {
        return fc.assert(
          fc.property(arbDailySequence(limit), (days) => {
            const userId = 'user-test';
            const summaries = [makeSummary(userId, limit)];
            const daily = days.map((d) =>
              makeDaily(userId, d.dayOfMonth, d.spend),
            );

            const signals = detectRiskHint(daily, summaries);

            for (const signal of signals) {
              expect(signal.group).toBe('risk_hint');
              expect(signal.severity).toBe('critical');
            }
          }),
          { numRuns: 50 },
        );
      }),
      { numRuns: 10 },
    );
  });

  it('no risk hint for a single isolated high-spend day', () => {
    fc.assert(
      fc.property(
        arbLimit,
        fc.integer({ min: 1, max: 28 }),
        (limit, dayOfMonth) => {
          const userId = 'user-test';
          const threshold = limit.mul(0.2);
          const highSpend = threshold.add(1);

          const summaries = [makeSummary(userId, limit)];
          // Single high-spend day with low-spend days surrounding it
          const daily = [
            makeDaily(userId, Math.max(1, dayOfMonth - 1), new Decimal('0')),
            makeDaily(userId, dayOfMonth, highSpend),
            makeDaily(userId, Math.min(28, dayOfMonth + 2), new Decimal('0')),
          ];

          const signals = detectRiskHint(daily, summaries);
          expect(signals).toHaveLength(0);
        },
      ),
    );
  });

  it('no risk hint for non-consecutive high-spend days (gap between them)', () => {
    fc.assert(
      fc.property(
        arbLimit,
        fc.integer({ min: 1, max: 25 }),
        fc.integer({ min: 2, max: 5 }),
        (limit, startDay, gap) => {
          const userId = 'user-test';
          const threshold = limit.mul(0.2);
          const highSpend = threshold.add(1);
          const lowSpend = new Decimal('0');

          const summaries = [makeSummary(userId, limit)];

          // Two high-spend days separated by a gap (non-consecutive)
          const day1 = startDay;
          const day2 = startDay + gap + 1; // gap >= 2 ensures non-consecutive

          const daily = [
            makeDaily(userId, day1, highSpend),
            makeDaily(userId, day1 + 1, lowSpend), // low-spend day in between
            makeDaily(userId, day2, highSpend),
          ];

          const signals = detectRiskHint(daily, summaries);
          expect(signals).toHaveLength(0);
        },
      ),
    );
  });
});
