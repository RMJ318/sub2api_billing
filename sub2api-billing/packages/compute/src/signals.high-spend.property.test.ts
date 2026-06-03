import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import Decimal from 'decimal.js';
import { detectHighSpend } from './signals.js';
import type { DailyUsageRecord, MonthlySummaryRecord } from './types/index.js';

/**
 * Property 36: High-spend alerts trigger above 20 percent of limit.
 *
 * Design statement: "If a user's single-day Spend exceeds 20 percent of that
 * user's Monthly_Budget_Limit, the Signal_Engine produces a high-spend alert
 * identifying the user, the date, and the day's Spend."
 *
 * The property validates both directions:
 * 1. A signal IS emitted when a day's spend strictly exceeds 20% of the limit.
 * 2. No signal is emitted when spend is at or below 20% of the limit.
 * 3. Emitted signals have group='high_spend' and severity='warning'.
 *
 * **Validates: Requirements 17.1**
 */

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a positive monthly limit (1 to 10000 USD). */
const limitArb = fc.double({ min: 1, max: 10_000, noNaN: true, noDefaultInfinity: true });

/** Generate a non-negative daily spend value (0 to 5000 USD). */
const spendArb = fc.double({ min: 0, max: 5_000, noNaN: true, noDefaultInfinity: true });

/** Generate a user_id string. */
const userIdArb = fc.string({ minLength: 1, maxLength: 8 }).map(s => `user_${s}`);

/** Build a minimal MonthlySummaryRecord with only the fields detectHighSpend uses. */
function makeSummary(userId: string, monthlyLimitUsd: number): MonthlySummaryRecord {
  return {
    billing_month: '2026-04',
    user_id: userId,
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: new Decimal(monthlyLimitUsd),
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
  };
}

/** Build a minimal DailyUsageRecord with only the fields detectHighSpend uses. */
function makeDaily(userId: string, usedUsd: number): DailyUsageRecord {
  return {
    billing_month: '2026-04',
    usage_date: new Date('2026-04-15T00:00:00Z'),
    user_id: userId,
    email: null,
    username: null,
    request_count: null,
    used_usd: new Decimal(usedUsd),
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
  };
}

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property 36: High-spend alerts trigger above 20 percent of limit', () => {
  it('emits a signal when daily spend strictly exceeds 20% of monthly limit', () => {
    fc.assert(
      fc.property(userIdArb, limitArb, (userId, limit) => {
        // Spend is strictly above 20% of limit.
        const threshold = limit * 0.2;
        // Ensure spend is above threshold by at least a small epsilon.
        const spend = threshold + Math.max(0.01, threshold * 0.01);

        const summaries = [makeSummary(userId, limit)];
        const daily = [makeDaily(userId, spend)];

        const signals = detectHighSpend(daily, summaries);

        // At least one signal emitted for this user/day.
        expect(signals.length).toBeGreaterThanOrEqual(1);

        // Verify the signal properties.
        const signal = signals[0]!;
        expect(signal.group).toBe('high_spend');
        expect(signal.severity).toBe('warning');
        expect(signal.target.page).toBe('user-analysis');
        expect(signal.target.entityId).toBe(userId);
      }),
      { numRuns: 100 },
    );
  });

  it('does NOT emit a signal when daily spend is at or below 20% of monthly limit', () => {
    fc.assert(
      fc.property(
        userIdArb,
        limitArb,
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (userId, limit, fraction) => {
          // Spend is at most 20% of limit (fraction scales 0..1 to 0..threshold).
          const threshold = limit * 0.2;
          const spend = threshold * fraction; // Always <= threshold

          const summaries = [makeSummary(userId, limit)];
          const daily = [makeDaily(userId, spend)];

          const signals = detectHighSpend(daily, summaries);

          // No signal should be emitted.
          expect(signals.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('emits no signal when spend equals exactly 20% of the limit (boundary)', () => {
    // Use integer multiples of 5 to avoid float precision issues when computing
    // exactly 20% (limit / 5). This isolates the boundary test from representation noise.
    const intLimitArb = fc.integer({ min: 5, max: 10_000 }).map(n => n * 5);
    fc.assert(
      fc.property(userIdArb, intLimitArb, (userId, limit) => {
        // Spend is exactly 20% of limit — use Decimal arithmetic for precision.
        const spendDecimal = new Decimal(limit).mul('0.2');
        const spend = spendDecimal.toNumber();

        const summaries = [makeSummary(userId, limit)];
        // Build daily record using Decimal directly to avoid float round-trip.
        const daily: DailyUsageRecord[] = [{
          billing_month: '2026-04',
          usage_date: new Date('2026-04-15T00:00:00Z'),
          user_id: userId,
          email: null,
          username: null,
          request_count: null,
          used_usd: spendDecimal,
          input_tokens: null,
          output_tokens: null,
          cache_read_tokens: null,
          image_output_tokens: null,
          avg_duration_ms: null,
        }];

        const signals = detectHighSpend(daily, summaries);

        // At the boundary (not strictly exceeding), no signal is emitted.
        expect(signals.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('every emitted signal has group=high_spend and severity=warning', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(userIdArb, limitArb, spendArb),
          { minLength: 1, maxLength: 10 },
        ),
        (entries) => {
          // Use unique user ids so each entry has its own limit lookup.
          const summaries = entries.map(([userId, limit], i) =>
            makeSummary(`${userId}_${i}`, limit),
          );
          const daily = entries.map(([userId, spend, _], i) =>
            makeDaily(`${userId}_${i}`, spend),
          );

          // Fix: spend is the third tuple element, limit is the second.
          // Re-map daily with actual spend values from entries.
          const dailyFixed = entries.map(([userId, _limit, spend], i) =>
            makeDaily(`${userId}_${i}`, spend),
          );

          const signals = detectHighSpend(dailyFixed, summaries);

          // ALL emitted signals have the correct group and severity.
          for (const signal of signals) {
            expect(signal.group).toBe('high_spend');
            expect(signal.severity).toBe('warning');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
