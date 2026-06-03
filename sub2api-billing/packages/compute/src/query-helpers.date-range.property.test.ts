import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { filterByDateRange } from './query-helpers.js';
import type { DateRange } from './types/query.js';

/**
 * Property 24: Date-range filtering is inclusive.
 *
 * Design statement: "For any set of dated records and a Date_Range_Filter with
 * start on or before end, the constrained set contains exactly the records
 * whose date is greater than or equal to the start and less than or equal to
 * the end."
 *
 * Validates: Requirements 19.2
 *
 * The test generates an arbitrary list of rows carrying a nullable date and
 * a valid (start <= end) date range. It verifies:
 * - Records on the start date are included
 * - Records on the end date are included
 * - Records between start and end are included
 * - Records outside the range are excluded
 * - Records with null date are excluded
 */

interface Row {
  readonly id: number;
  readonly date: Date | null;
}

/**
 * Arbitrary that generates a date within a reasonable range (one year span)
 * at millisecond precision so boundary hits are common.
 */
const dateArb = fc.integer({ min: 0, max: 365 * 24 * 60 }).map(
  (minutes) => new Date(Date.UTC(2026, 0, 1) + minutes * 60_000),
);

/** Arbitrary that generates null or a date. */
const nullableDateArb: fc.Arbitrary<Date | null> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 5, arbitrary: dateArb },
);

/** Generate a valid date range where start <= end. */
const dateRangeArb: fc.Arbitrary<DateRange> = fc
  .tuple(dateArb, dateArb)
  .map(([a, b]) => {
    const start = a.getTime() <= b.getTime() ? a : b;
    const end = a.getTime() <= b.getTime() ? b : a;
    return { start, end };
  });

/** Generate an array of rows with unique ids and nullable dates. */
const rowsArb: fc.Arbitrary<Row[]> = fc
  .array(nullableDateArb, { maxLength: 40 })
  .map((dates) => dates.map((date, id): Row => ({ id, date })));

describe('filterByDateRange (Property 24: date-range filtering is inclusive)', () => {
  it('includes exactly those rows whose date is >= start and <= end, excludes others and nulls', () => {
    fc.assert(
      fc.property(rowsArb, dateRangeArb, (rows, range) => {
        const result = filterByDateRange(rows, (r) => r.date, range);

        const startMs = range.start.getTime();
        const endMs = range.end.getTime();

        // Compute the expected set: rows with a non-null date within [start, end].
        const expected = rows.filter((r) => {
          if (r.date === null) return false;
          const ms = r.date.getTime();
          return ms >= startMs && ms <= endMs;
        });

        // Result should match expected exactly (same elements, same order).
        expect(result).toEqual(expected);

        // Every returned row has a date within the inclusive range.
        for (const r of result) {
          expect(r.date).not.toBeNull();
          const ms = r.date!.getTime();
          expect(ms).toBeGreaterThanOrEqual(startMs);
          expect(ms).toBeLessThanOrEqual(endMs);
        }

        // No row outside the range is included.
        const resultIds = new Set(result.map((r) => r.id));
        for (const r of rows) {
          if (!resultIds.has(r.id)) {
            // This row was excluded — verify it's either null or outside range.
            if (r.date !== null) {
              const ms = r.date.getTime();
              expect(ms < startMs || ms > endMs).toBe(true);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('records exactly on the start date are included', () => {
    fc.assert(
      fc.property(dateRangeArb, (range) => {
        const row: Row = { id: 0, date: range.start };
        const result = filterByDateRange([row], (r) => r.date, range);
        expect(result).toEqual([row]);
      }),
      { numRuns: 100 },
    );
  });

  it('records exactly on the end date are included', () => {
    fc.assert(
      fc.property(dateRangeArb, (range) => {
        const row: Row = { id: 0, date: range.end };
        const result = filterByDateRange([row], (r) => r.date, range);
        expect(result).toEqual([row]);
      }),
      { numRuns: 100 },
    );
  });

  it('records outside the range are excluded', () => {
    fc.assert(
      fc.property(dateRangeArb, fc.boolean(), (range, beforeNotAfter) => {
        // Generate a date strictly outside the range.
        const outsideDate = beforeNotAfter
          ? new Date(range.start.getTime() - 1)
          : new Date(range.end.getTime() + 1);
        const row: Row = { id: 0, date: outsideDate };
        const result = filterByDateRange([row], (r) => r.date, range);
        expect(result).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('preserves original order of included rows', () => {
    fc.assert(
      fc.property(rowsArb, dateRangeArb, (rows, range) => {
        const result = filterByDateRange(rows, (r) => r.date, range);

        // Verify that the result preserves original relative order.
        for (let i = 1; i < result.length; i++) {
          const idxPrev = rows.findIndex((r) => r.id === result[i - 1].id);
          const idxCurr = rows.findIndex((r) => r.id === result[i].id);
          expect(idxPrev).toBeLessThan(idxCurr);
        }
      }),
      { numRuns: 100 },
    );
  });
});
