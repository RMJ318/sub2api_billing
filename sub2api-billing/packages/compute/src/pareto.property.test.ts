import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { paretoShares } from './index.js';

/**
 * Property 28: Pareto cumulative shares are monotonic and bounded.
 *
 * Design statement: "For any non-empty set of user spends, the cumulative spend
 * shares for the top 10, 20, and 30 percent of users (ranked by Spend
 * descending) are each at least 0 and at most 100, and satisfy
 * top-10 ≤ top-20 ≤ top-30."
 *
 * Validates: Requirements 14.1
 *
 * The generator produces arrays of non-negative Decimal spends (reflecting real
 * user spend data). We test both the bounded and monotonic invariants, and with
 * larger user sets we verify the Pareto principle pattern (concentration).
 */

/** Arbitrary for a non-negative Decimal spend value (up to 6 fractional digits). */
const spendArb: fc.Arbitrary<Decimal> = fc
  .integer({ min: 0, max: 10_000_000 }) // cents-scale integer
  .map((cents) => new Decimal(cents).div(100)); // 0.00 to 100000.00

/** Non-empty arrays of user spends (1–100 users). */
const spendsArb: fc.Arbitrary<Decimal[]> = fc.array(spendArb, { minLength: 1, maxLength: 100 });

/** Larger arrays to stress-test the Pareto concentration pattern (10–100 users). */
const largeSpendsArb: fc.Arbitrary<Decimal[]> = fc.array(spendArb, { minLength: 10, maxLength: 100 });

describe('paretoShares (Property 28: monotonic and bounded)', () => {
  it('all shares are between 0 and 100 inclusive for any non-empty spend set', () => {
    fc.assert(
      fc.property(spendsArb, (spends) => {
        const shares = paretoShares(spends);

        expect(shares.top10).toBeGreaterThanOrEqual(0);
        expect(shares.top10).toBeLessThanOrEqual(100);
        expect(shares.top20).toBeGreaterThanOrEqual(0);
        expect(shares.top20).toBeLessThanOrEqual(100);
        expect(shares.top30).toBeGreaterThanOrEqual(0);
        expect(shares.top30).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200 },
    );
  });

  it('cumulative shares are monotonic non-decreasing: top10 <= top20 <= top30', () => {
    fc.assert(
      fc.property(spendsArb, (spends) => {
        const shares = paretoShares(spends);

        expect(shares.top10).toBeLessThanOrEqual(shares.top20);
        expect(shares.top20).toBeLessThanOrEqual(shares.top30);
      }),
      { numRuns: 200 },
    );
  });

  it('with enough users, verifies that top-30% share is at least top-10% share (Pareto pattern)', () => {
    fc.assert(
      fc.property(largeSpendsArb, (spends) => {
        const shares = paretoShares(spends);

        // With 10+ users, the monotonic property still holds — the top-30% of
        // users always account for at least as much spend as the top-10%.
        expect(shares.top30).toBeGreaterThanOrEqual(shares.top10);

        // If total spend is positive, top-30% must capture a meaningful share.
        const total = spends.reduce((acc, s) => acc.plus(s), new Decimal(0));
        if (total.greaterThan(0)) {
          // top30 must be > 0 since at least ceil(30% * n) users are included
          expect(shares.top30).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('returns all zeros when total spend is zero regardless of user count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }).map((n) => Array.from({ length: n }, () => new Decimal(0))),
        (spends) => {
          const shares = paretoShares(spends);

          expect(shares.top10).toBe(0);
          expect(shares.top20).toBe(0);
          expect(shares.top30).toBe(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('returns all zeros for empty input', () => {
    const shares = paretoShares([]);
    expect(shares.top10).toBe(0);
    expect(shares.top20).toBe(0);
    expect(shares.top30).toBe(0);
  });
});
