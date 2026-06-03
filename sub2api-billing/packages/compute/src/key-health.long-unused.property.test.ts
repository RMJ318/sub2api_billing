import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { KeyUsageRecord } from './types/records.js';
import { longUnusedKeys, billingMonthEnd } from './key-health.js';

/**
 * Property 30: Long-unused keys are exactly those idle beyond 14 days.
 *
 * Design statement: "For any set of Key_Usage_Records and a selected
 * Billing_Month, a key is classified as long-unused if and only if its
 * `last_request_at` is more than 14 days before the end of that month."
 *
 * Validates: Requirements 12.4
 *
 * The test generates arbitrary keys with varied `last_request_at` timestamps
 * (including null) and checks that the function's output matches the
 * specification exactly:
 * - A key IS long-unused iff last_request_at < monthEnd - 14 days (strictly)
 * - Keys at exactly the threshold are NOT flagged (strictly more than 14 days)
 * - Keys with null last_request_at are excluded
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Arbitrary valid Billing_Month strings (YYYY-MM). */
const billingMonthArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
  })
  .map(({ year, month }) => `${year}-${String(month).padStart(2, '0')}`);

/** Helper to create a minimal KeyUsageRecord with given overrides. */
function makeKey(
  id: string,
  billingMonth: string,
  lastRequestAt: Date | null,
): KeyUsageRecord {
  return {
    billing_month: billingMonth,
    user_id: 'user-1',
    email: null,
    username: null,
    api_key_id: id,
    api_key_name: null,
    api_key_status: null,
    api_key_deleted: null,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    first_request_at: null,
    last_request_at: lastRequestAt,
  };
}

/**
 * Generate a `last_request_at` value that is either null or a Date within a
 * reasonable range around the month end (spread across months to test boundary
 * behaviour).
 */
function lastRequestAtArb(monthEnd: Date): fc.Arbitrary<Date | null> {
  // Generate dates spanning from 30 days before month end to 1 day after
  const rangeStart = monthEnd.getTime() - 30 * MS_PER_DAY;
  const rangeEnd = monthEnd.getTime() + MS_PER_DAY;
  return fc.oneof(
    { weight: 1, arbitrary: fc.constant(null) },
    {
      weight: 5,
      arbitrary: fc
        .integer({ min: rangeStart, max: rangeEnd })
        .map((ms) => new Date(ms)),
    },
  );
}

describe('longUnusedKeys (Property 30: Long-unused keys are exactly those idle beyond 14 days)', () => {
  it('a key is long-unused iff last_request_at < monthEnd - 14 days, null keys excluded', () => {
    fc.assert(
      fc.property(billingMonthArb, fc.integer({ min: 1, max: 20 }), (month, keyCount) => {
        const monthEnd = billingMonthEnd(month);
        const threshold = monthEnd.getTime() - 14 * MS_PER_DAY;

        // Generate keys with various last_request_at values around the threshold
        const keysResult = fc.sample(
          lastRequestAtArb(monthEnd).map((lastReq, idx) =>
            makeKey(`key-${idx}`, month, lastReq),
          ),
          keyCount,
        );

        const result = longUnusedKeys(keysResult, month);

        // Compute expected: keys with non-null last_request_at strictly before threshold
        const expected = keysResult.filter(
          (k) => k.last_request_at !== null && k.last_request_at.getTime() < threshold,
        );

        // The result must contain exactly the expected keys (same set)
        expect(result.length).toBe(expected.length);

        // Each key in result must satisfy the long-unused condition
        for (const key of result) {
          expect(key.last_request_at).not.toBeNull();
          expect(key.last_request_at!.getTime()).toBeLessThan(threshold);
        }

        // Each key NOT in result must either have null last_request_at or be at/after threshold
        const resultIds = new Set(result.map((k) => k.api_key_id));
        for (const key of keysResult) {
          if (!resultIds.has(key.api_key_id)) {
            if (key.last_request_at !== null) {
              expect(key.last_request_at.getTime()).toBeGreaterThanOrEqual(threshold);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('keys at exactly the threshold are NOT flagged (strictly more than 14 days)', () => {
    fc.assert(
      fc.property(billingMonthArb, (month) => {
        const monthEnd = billingMonthEnd(month);
        const threshold = monthEnd.getTime() - 14 * MS_PER_DAY;

        // Key at exactly the threshold timestamp
        const atThreshold = makeKey('key-at', month, new Date(threshold));
        // Key 1ms before threshold (should be flagged)
        const beforeThreshold = makeKey('key-before', month, new Date(threshold - 1));
        // Key 1ms after threshold (should not be flagged)
        const afterThreshold = makeKey('key-after', month, new Date(threshold + 1));

        const result = longUnusedKeys([atThreshold, beforeThreshold, afterThreshold], month);

        // Only the key before threshold should be flagged
        expect(result.length).toBe(1);
        expect(result[0].api_key_id).toBe('key-before');
      }),
      { numRuns: 100 },
    );
  });

  it('keys with null last_request_at are always excluded', () => {
    fc.assert(
      fc.property(
        billingMonthArb,
        fc.array(fc.constant(null), { minLength: 1, maxLength: 10 }),
        (month, nulls) => {
          const keys = nulls.map((_, idx) => makeKey(`key-null-${idx}`, month, null));
          const result = longUnusedKeys(keys, month);
          expect(result.length).toBe(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});
