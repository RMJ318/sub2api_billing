import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { stableSortBy, compareValues, type SortValue } from './query-helpers.js';
import type { SortDir } from './types/query.js';

/**
 * Property 20: Sorting orders rows by the selected column and direction.
 *
 * Design statement: "For any set of rows and any selectable column and
 * direction, the sorted output is a permutation of the input ordered
 * non-decreasingly (ascending) or non-increasingly (descending) by that
 * column; the budget monitoring list is ordered by Usage_Percent descending
 * and the request-detail default order is created_at descending."
 *
 * Validates: Requirements 3.5, 7.2, 9.4
 *
 * The test generates rows with a unique index (to verify permutation and
 * stability) and a sort key drawn from multiple column types (number, string,
 * Decimal, Date, null) with frequent ties to stress stability.
 */

/** A row carrying a unique original index and a sortable column value. */
interface TestRow {
  readonly originalIndex: number;
  readonly key: SortValue;
}

/** Arbitrary for sort direction. */
const dirArb: fc.Arbitrary<SortDir> = fc.constantFrom('asc', 'desc');

/**
 * Arbitrary for a sort key value covering the column types used in the
 * normalized records: numbers (with frequent ties via a small range),
 * strings, Decimal money values, Dates, and null.
 */
const sortKeyArb: fc.Arbitrary<SortValue> = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: -10, max: 10 }) },
  { weight: 2, arbitrary: fc.string({ maxLength: 5 }) },
  { weight: 2, arbitrary: fc.integer({ min: -100, max: 100 }).map((n) => new Decimal(n).div(10)) },
  {
    weight: 2,
    arbitrary: fc.integer({ min: 1700000000000, max: 1750000000000 }).map((ms) => new Date(ms)),
  },
  { weight: 2, arbitrary: fc.constant(null) },
);

/**
 * Arbitrary for an array of rows with unique originalIndex and a key drawn
 * from sortKeyArb. All keys in a given array share the same type (simulating
 * a homogeneous column) to match the real usage where a column is always the
 * same type across rows.
 */
const homogeneousRowsArb: fc.Arbitrary<TestRow[]> = fc.oneof(
  // numeric column (ties encouraged by small range)
  fc
    .array(fc.integer({ min: -5, max: 5 }), { maxLength: 30 })
    .map((keys) => keys.map((key, i): TestRow => ({ originalIndex: i, key }))),
  // string column (tie-prone: pick from a small set of short strings)
  fc
    .array(fc.constantFrom('a', 'b', 'c', 'ab', 'bc', 'ca', ''), { maxLength: 30 })
    .map((keys) => keys.map((key, i): TestRow => ({ originalIndex: i, key }))),
  // Decimal money column
  fc
    .array(fc.integer({ min: -20, max: 20 }).map((n) => new Decimal(n).div(10)), { maxLength: 30 })
    .map((keys) => keys.map((key, i): TestRow => ({ originalIndex: i, key }))),
  // Date column with some nulls
  fc
    .array(
      fc.oneof(
        fc.integer({ min: 1700000000000, max: 1700001000000 }).map((ms) => new Date(ms) as SortValue),
        fc.constant(null as SortValue),
      ),
      { maxLength: 30 },
    )
    .map((keys) => keys.map((key, i): TestRow => ({ originalIndex: i, key }))),
);

describe('stableSortBy (Property 20: Sorting orders rows by the selected column and direction)', () => {
  it('output is a permutation of the input (no data loss or duplication)', () => {
    fc.assert(
      fc.property(homogeneousRowsArb, dirArb, (rows, dir) => {
        const result = stableSortBy(rows, (r) => r.key, dir);

        // Same length.
        expect(result.length).toBe(rows.length);

        // Same set of originalIndex values (permutation check).
        const inputIndices = rows.map((r) => r.originalIndex).sort((a, b) => a - b);
        const outputIndices = result.map((r) => r.originalIndex).sort((a, b) => a - b);
        expect(outputIndices).toEqual(inputIndices);
      }),
      { numRuns: 200 },
    );
  });

  it('rows are ordered by the selected column in the specified direction', () => {
    fc.assert(
      fc.property(homogeneousRowsArb, dirArb, (rows, dir) => {
        const result = stableSortBy(rows, (r) => r.key, dir);

        // Adjacent pairs must satisfy the ordering invariant.
        for (let i = 0; i + 1 < result.length; i++) {
          const cmp = compareValues(result[i]!.key, result[i + 1]!.key);
          if (dir === 'asc') {
            // Non-decreasing: each element <= next.
            expect(cmp).toBeLessThanOrEqual(0);
          } else {
            // Non-increasing: each element >= next.
            expect(cmp).toBeGreaterThanOrEqual(0);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('sort is stable: equal elements maintain their relative order', () => {
    fc.assert(
      fc.property(homogeneousRowsArb, dirArb, (rows, dir) => {
        const result = stableSortBy(rows, (r) => r.key, dir);

        // For every pair of result elements that compare as equal, the one
        // that appeared first in the input must appear first in the output.
        for (let i = 0; i + 1 < result.length; i++) {
          const cmp = compareValues(result[i]!.key, result[i + 1]!.key);
          if (cmp === 0) {
            expect(result[i]!.originalIndex).toBeLessThan(result[i + 1]!.originalIndex);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('input array is not mutated', () => {
    fc.assert(
      fc.property(homogeneousRowsArb, dirArb, (rows, dir) => {
        const snapshot = [...rows];
        stableSortBy(rows, (r) => r.key, dir);
        expect(rows.length).toBe(snapshot.length);
        for (let i = 0; i < snapshot.length; i++) {
          expect(rows[i]).toBe(snapshot[i]);
        }
      }),
      { numRuns: 100 },
    );
  });
});
