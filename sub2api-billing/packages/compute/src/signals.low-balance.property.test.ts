import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { detectLowBalance } from './signals.js';
import type { MonthlySummaryRecord } from './types/index.js';

/**
 * Property 37: Low-balance alerts trigger at or below 10 percent remaining.
 *
 * IF a user's `remaining_monthly_limit_usd` is less than or equal to 10 percent
 * of that user's `monthly_limit_usd`, THEN the Signal_Engine SHALL produce a
 * low-balance alert identifying the user and the remaining amount.
 *
 * - A signal is emitted when remaining balance is <= 10% of the monthly limit.
 * - No signal is emitted when remaining is above 10% of the limit.
 * - The signal has group='low_balance' and severity='critical'.
 *
 * **Validates: Requirements 17.2**
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal MonthlySummaryRecord with the fields relevant to low-balance detection. */
function makeSummary(overrides: {
  user_id: string;
  monthly_limit_usd: Decimal | null;
  remaining_monthly_limit_usd: Decimal | null;
}): MonthlySummaryRecord {
  return {
    billing_month: '2026-05',
    user_id: overrides.user_id,
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: overrides.monthly_limit_usd,
    used_usd: null,
    remaining_monthly_limit_usd: overrides.remaining_monthly_limit_usd,
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

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generates a positive monthly limit (at least 1 USD). */
const positiveLimit = fc
  .integer({ min: 1, max: 100_000 })
  .map((n) => new Decimal(n));

/** Generates a user_id string. */
const userId = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

/**
 * Generates a remaining balance that is <= 10% of the given limit
 * (the trigger threshold). Includes the boundary (exactly 10%) and below.
 */
function remainingAtOrBelowThreshold(limit: Decimal): fc.Arbitrary<Decimal> {
  const thresholdCents = limit.mul(0.1).mul(100).floor().toNumber();
  // Generate 0..threshold in cents, then convert back to USD
  return fc
    .integer({ min: 0, max: Math.max(0, thresholdCents) })
    .map((cents) => new Decimal(cents).div(100));
}

/**
 * Generates a remaining balance that is strictly above 10% of the given limit
 * (no alert should fire).
 */
function remainingAboveThreshold(limit: Decimal): fc.Arbitrary<Decimal> {
  const thresholdCents = limit.mul(0.1).mul(100).floor().toNumber();
  const limitCents = limit.mul(100).toNumber();
  // Generate (threshold+1)..limit in cents
  return fc
    .integer({ min: thresholdCents + 1, max: limitCents })
    .map((cents) => new Decimal(cents).div(100));
}

// ─── Properties ─────────────────────────────────────────────────────────────

describe('Property 37: Low-balance alerts trigger at or below 10 percent remaining', () => {
  it('emits a low-balance signal when remaining <= 10% of limit', () => {
    fc.assert(
      fc.property(
        positiveLimit.chain((limit) =>
          fc.tuple(
            userId,
            fc.constant(limit),
            remainingAtOrBelowThreshold(limit),
          ),
        ),
        ([uid, limit, remaining]) => {
          const summary = makeSummary({
            user_id: uid,
            monthly_limit_usd: limit,
            remaining_monthly_limit_usd: remaining,
          });

          const signals = detectLowBalance([summary]);

          // At least one signal should be produced for this user
          expect(signals.length).toBe(1);
          expect(signals[0]!.group).toBe('low_balance');
          expect(signals[0]!.severity).toBe('critical');
        },
      ),
    );
  });

  it('does NOT emit a signal when remaining is above 10% of limit', () => {
    fc.assert(
      fc.property(
        positiveLimit
          .filter((limit) => limit.gte(10)) // ensure there's room above threshold
          .chain((limit) =>
            fc.tuple(
              userId,
              fc.constant(limit),
              remainingAboveThreshold(limit),
            ),
          ),
        ([uid, limit, remaining]) => {
          const summary = makeSummary({
            user_id: uid,
            monthly_limit_usd: limit,
            remaining_monthly_limit_usd: remaining,
          });

          const signals = detectLowBalance([summary]);

          // No signal should fire
          expect(signals.length).toBe(0);
        },
      ),
    );
  });

  it('signal has group "low_balance" and severity "critical"', () => {
    fc.assert(
      fc.property(
        positiveLimit.chain((limit) =>
          fc.tuple(
            userId,
            fc.constant(limit),
            remainingAtOrBelowThreshold(limit),
          ),
        ),
        ([uid, limit, remaining]) => {
          const summary = makeSummary({
            user_id: uid,
            monthly_limit_usd: limit,
            remaining_monthly_limit_usd: remaining,
          });

          const signals = detectLowBalance([summary]);

          for (const signal of signals) {
            expect(signal.group).toBe('low_balance');
            expect(signal.severity).toBe('critical');
            expect(signal.read).toBe(false);
            expect(signal.target.page).toBe('user-analysis');
            expect(signal.target.entityId).toBe(uid);
          }
        },
      ),
    );
  });

  it('skips users with null or zero monthly limit (no division by zero)', () => {
    fc.assert(
      fc.property(userId, (uid) => {
        const summaryNullLimit = makeSummary({
          user_id: uid,
          monthly_limit_usd: null,
          remaining_monthly_limit_usd: new Decimal('50'),
        });
        const summaryZeroLimit = makeSummary({
          user_id: uid,
          monthly_limit_usd: new Decimal('0'),
          remaining_monthly_limit_usd: new Decimal('0'),
        });

        expect(detectLowBalance([summaryNullLimit])).toHaveLength(0);
        expect(detectLowBalance([summaryZeroLimit])).toHaveLength(0);
      }),
    );
  });

  it('skips users with null remaining balance', () => {
    fc.assert(
      fc.property(
        fc.tuple(userId, positiveLimit),
        ([uid, limit]) => {
          const summary = makeSummary({
            user_id: uid,
            monthly_limit_usd: limit,
            remaining_monthly_limit_usd: null,
          });

          expect(detectLowBalance([summary])).toHaveLength(0);
        },
      ),
    );
  });
});
