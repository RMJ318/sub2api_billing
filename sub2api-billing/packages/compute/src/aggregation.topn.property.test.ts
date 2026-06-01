import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { topN } from './aggregation.js';

/**
 * Property 18: Top-N ranking is bounded, descending, and complete when small.
 *
 * Design statement: "For any set of records and limit N, the top-N ranking by
 * the chosen metric is sorted in descending order, contains at most N entries,
 * contains every record when fewer than N exist, and selects the N
 * highest-metric records."
 *
 * Validates: Requirements 5.2, 12.5
 *
 * The generated row carries a unique `id` (used to detect mutation of the input
 * array by reference) and a `metric` drawn from a small integer range so that
 * ties between rows occur frequently — this stresses both the descending-order
 * and "N highest" boundary behaviour with equal metric values.
 */

interface Row {
  readonly id: number;
  readonly metric: number;
}

const metricOf = (r: Row): number => r.metric;

/** Arrays of rows with unique ids and a tie-prone integer metric. */
const rowsArb: fc.Arbitrary<Row[]> = fc
  .array(fc.integer({ min: -50, max: 50 }), { maxLength: 40 })
  .map((metrics) => metrics.map((metric, id): Row => ({ id, metric })));

describe('topN (Property 18: bounded, descending, complete when small)', () => {
  it('returns at most n rows, all rows when fewer than n, sorted descending by the n highest metrics, without mutating the input', () => {
    fc.assert(
      fc.property(rowsArb, fc.nat({ max: 50 }), (rows, n) => {
        // Snapshot the input (references and order) to verify non-mutation.
        const before = [...rows];

        const result = topN(rows, metricOf, n);

        // Bounded + complete-when-small: length is exactly min(n, rows.length).
        const expectedLength = Math.min(n, rows.length);
        expect(result.length).toBe(expectedLength);

        // Sorted in descending order by the chosen metric.
        for (let i = 0; i + 1 < result.length; i++) {
          expect(metricOf(result[i])).toBeGreaterThanOrEqual(metricOf(result[i + 1]));
        }

        // Selects the n highest-metric records: comparing the result's metrics
        // (already descending) against the top slice of all metrics sorted
        // descending is tie-safe because it compares values, not identities.
        const allMetricsDesc = rows.map(metricOf).sort((a, b) => b - a);
        const expectedMetricsDesc = allMetricsDesc.slice(0, expectedLength);
        expect(result.map(metricOf)).toEqual(expectedMetricsDesc);

        // Equivalent boundary phrasing: every selected metric is >= every
        // metric left behind (the highest excluded value).
        const selectedIds = new Set(result.map((r) => r.id));
        const excluded = rows.filter((r) => !selectedIds.has(r.id));
        if (result.length > 0 && excluded.length > 0) {
          const minSelected = Math.min(...result.map(metricOf));
          const maxExcluded = Math.max(...excluded.map(metricOf));
          expect(minSelected).toBeGreaterThanOrEqual(maxExcluded);
        }

        // Every returned row is one of the input rows (subset by reference).
        const inputIds = new Set(rows.map((r) => r.id));
        for (const r of result) {
          expect(inputIds.has(r.id)).toBe(true);
        }

        // Input array is not mutated: same length, same references, same order.
        expect(rows.length).toBe(before.length);
        for (let i = 0; i < before.length; i++) {
          expect(rows[i]).toBe(before[i]);
        }
      }),
      { numRuns: 100 },
    );
  });
});
