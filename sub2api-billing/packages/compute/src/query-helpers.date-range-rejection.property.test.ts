import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isValidDateRange } from './query-helpers.js';

/**
 * Property 25: Date ranges with start after end are rejected.
 *
 * Design statement: "For any Date_Range_Filter, the selection is rejected if
 * and only if the start date is later than the end date."
 *
 * Validates: Requirements 19.3
 *
 * The property is bidirectional ("if and only if"):
 * - When start > end, isValidDateRange returns false (rejection).
 * - When start <= end, isValidDateRange returns true (acceptance).
 *
 * This validation occurs before any filtering — the `isValidDateRange` guard
 * is a pure predicate that callers check before applying `filterByDateRange`.
 */

/** Arbitrary producing a valid epoch millisecond timestamp within a reasonable range. */
const dateMs = fc.integer({ min: 0, max: 4_102_444_800_000 }); // 0 to ~2100

describe('isValidDateRange (Property 25: date ranges with start after end are rejected)', () => {
  it('rejects if and only if start is after end — rejection detected before any filtering', () => {
    fc.assert(
      fc.property(dateMs, dateMs, (msA, msB) => {
        const dateA = new Date(msA);
        const dateB = new Date(msB);

        const range = { start: dateA, end: dateB };
        const result = isValidDateRange(range);

        if (msA > msB) {
          // Start is after end → must be rejected (false).
          expect(result).toBe(false);
        } else {
          // Start is on or before end → must be accepted (true).
          expect(result).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a range whose start equals its end is accepted (single-instant range)', () => {
    fc.assert(
      fc.property(dateMs, (ms) => {
        const date = new Date(ms);
        expect(isValidDateRange({ start: date, end: date })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
