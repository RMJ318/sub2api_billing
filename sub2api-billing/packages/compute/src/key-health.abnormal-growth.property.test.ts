import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { KeyUsageRecord } from './types/records.js';
import { abnormalGrowthKeys } from './key-health.js';

/**
 * Property 31: Abnormal-growth keys exceed the 200 percent threshold.
 *
 * Design statement: "For any API key with request counts in a Billing_Month and
 * its immediately preceding Billing_Month, the key is classified as
 * abnormal-growth if and only if its request count increased by at least 200
 * percent relative to the preceding month."
 *
 * Validates: Requirements 12.6
 *
 * The property verifies three aspects:
 * 1. A key is flagged if and only if (current - preceding) / preceding * 100 >= 200
 * 2. Keys with zero preceding count are excluded (undefined relative growth)
 * 3. Keys not present in the preceding month are excluded
 */

/** Helper to create a minimal KeyUsageRecord for property testing. */
function makeKey(
  apiKeyId: string,
  requestCount: number | null,
  billingMonth = '2026-05',
): KeyUsageRecord {
  return {
    billing_month: billingMonth,
    user_id: 'user-1',
    email: null,
    username: null,
    api_key_id: apiKeyId,
    api_key_name: null,
    api_key_status: null,
    api_key_deleted: null,
    request_count: requestCount,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    first_request_at: null,
    last_request_at: null,
  };
}

/**
 * Arbitrary for a positive preceding request count (> 0) so that relative
 * growth is well-defined.
 */
const positivePrecedingCount = fc.integer({ min: 1, max: 10_000 });

/**
 * Arbitrary for a non-negative current request count.
 */
const nonNegativeCount = fc.integer({ min: 0, max: 100_000 });

/**
 * Arbitrary for a unique key id string.
 */
const keyIdArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

describe('abnormalGrowthKeys (Property 31: Abnormal-growth keys exceed the 200 percent threshold)', () => {
  it('flags a key if and only if growth >= 200%', () => {
    fc.assert(
      fc.property(
        positivePrecedingCount,
        nonNegativeCount,
        keyIdArb,
        (precedingCount, currentCount, keyId) => {
          const preceding = [makeKey(keyId, precedingCount, '2026-04')];
          const current = [makeKey(keyId, currentCount, '2026-05')];

          const result = abnormalGrowthKeys(current, preceding);
          const growthPercent = ((currentCount - precedingCount) / precedingCount) * 100;

          if (growthPercent >= 200) {
            // Key MUST be flagged
            expect(result).toHaveLength(1);
            expect(result[0].key.api_key_id).toBe(keyId);
            expect(result[0].currentRequestCount).toBe(currentCount);
            expect(result[0].precedingRequestCount).toBe(precedingCount);
            expect(result[0].growthPercent).toBeCloseTo(growthPercent, 10);
          } else {
            // Key MUST NOT be flagged
            expect(result).toHaveLength(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('excludes keys with zero preceding count (undefined relative growth)', () => {
    fc.assert(
      fc.property(nonNegativeCount, keyIdArb, (currentCount, keyId) => {
        const preceding = [makeKey(keyId, 0, '2026-04')];
        const current = [makeKey(keyId, currentCount, '2026-05')];

        const result = abnormalGrowthKeys(current, preceding);

        // Zero preceding means undefined growth → never flagged
        expect(result).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('excludes keys not present in the preceding month', () => {
    fc.assert(
      fc.property(
        nonNegativeCount,
        keyIdArb,
        keyIdArb,
        (currentCount, currentKeyId, precedingKeyId) => {
          // Ensure the key IDs are different so current key has no preceding record
          fc.pre(currentKeyId !== precedingKeyId);

          const preceding = [makeKey(precedingKeyId, 50, '2026-04')];
          const current = [makeKey(currentKeyId, currentCount, '2026-05')];

          const result = abnormalGrowthKeys(current, preceding);

          // Current key has no preceding record → never flagged
          const flaggedIds = result.map((r) => r.key.api_key_id);
          expect(flaggedIds).not.toContain(currentKeyId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('correctly aggregates multiple records for the same key across months', () => {
    fc.assert(
      fc.property(
        keyIdArb,
        fc.array(positivePrecedingCount, { minLength: 1, maxLength: 5 }),
        fc.array(nonNegativeCount, { minLength: 1, maxLength: 5 }),
        (keyId, precedingCounts, currentCounts) => {
          const preceding = precedingCounts.map((c) => makeKey(keyId, c, '2026-04'));
          const current = currentCounts.map((c) => makeKey(keyId, c, '2026-05'));

          const totalPreceding = precedingCounts.reduce((a, b) => a + b, 0);
          const totalCurrent = currentCounts.reduce((a, b) => a + b, 0);

          // Skip if total preceding is 0 (degenerate case handled by other test)
          fc.pre(totalPreceding > 0);

          const result = abnormalGrowthKeys(current, preceding);
          const growthPercent = ((totalCurrent - totalPreceding) / totalPreceding) * 100;

          if (growthPercent >= 200) {
            expect(result).toHaveLength(1);
            expect(result[0].currentRequestCount).toBe(totalCurrent);
            expect(result[0].precedingRequestCount).toBe(totalPreceding);
            expect(result[0].growthPercent).toBeCloseTo(growthPercent, 10);
          } else {
            expect(result).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
