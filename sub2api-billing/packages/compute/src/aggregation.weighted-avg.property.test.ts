import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { weightedAvg } from './index.js';

/**
 * Property 13: Request-weighted averages follow the weighted-average formula.
 *
 * For any set of records with per-record `avg_duration_ms` (value) and
 * `request_count` (weight), the computed average equals
 * `sum(value * weight) / sum(weight)` and equals 0 when the total weight is 0.
 * This is the request-weighted average used for the Dashboard's average
 * response time over Monthly_Summary_Records and a model's `avg_duration_ms`
 * over Model_Usage_Records.
 *
 * **Validates: Requirements 4.7, 11.5**
 */

/** A single record carrying the value to average and its non-negative weight. */
interface WeightedRow {
  readonly value: number;
  readonly weight: number;
}

const pickValue = (r: WeightedRow): number => r.value;
const pickWeight = (r: WeightedRow): number => r.weight;

/**
 * Bounded, finite value generator. Values are kept to moderate magnitudes so
 * the reference computation and the implementation stay well inside double
 * precision, keeping any float drift far below the comparison tolerance.
 */
const valueArb = fc.double({
  min: -1_000_000,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Non-negative, finite weight generator (e.g. a per-row `request_count`). */
const weightArb = fc.double({
  min: 0,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

const rowArb: fc.Arbitrary<WeightedRow> = fc.record({
  value: valueArb,
  weight: weightArb,
});

/** Reference weighted-average computed independently from the formula. */
function referenceWeightedAvg(rows: readonly WeightedRow[]): number {
  const weightedSum = rows.reduce((acc, r) => acc + r.value * r.weight, 0);
  const totalWeight = rows.reduce((acc, r) => acc + r.weight, 0);
  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}

describe('Property 13: weightedAvg follows the weighted-average formula', () => {
  it('equals sum(value*weight)/sum(weight) within floating tolerance', () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const actual = weightedAvg(rows, pickValue, pickWeight);
        const expected = referenceWeightedAvg(rows);
        // Relative + absolute tolerance to absorb benign float-accumulation drift.
        const tolerance = 1e-6 * Math.max(1, Math.abs(expected));
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
      }),
      { numRuns: 100 },
    );
  });

  it('returns exactly 0 when the total weight is 0', () => {
    // Rows whose weights are all 0 (and the empty set) have total weight 0.
    const zeroWeightRowArb = valueArb.map((value): WeightedRow => ({ value, weight: 0 }));
    fc.assert(
      fc.property(fc.array(zeroWeightRowArb), (rows) => {
        const result = weightedAvg(rows, pickValue, pickWeight);
        expect(result).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('lies between the min and max contributing value when weights are non-negative', () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const result = weightedAvg(rows, pickValue, pickWeight);
        // A weighted average is a convex combination of the values whose weight
        // is positive, so it must lie within their [min, max] range. Rows with
        // zero weight do not contribute and are excluded from the bounds.
        const contributing = rows.filter((r) => r.weight > 0).map((r) => r.value);
        if (contributing.length === 0) {
          // No positive weights => total weight is 0 => result is 0 by definition.
          expect(result).toBe(0);
          return;
        }
        const min = Math.min(...contributing);
        const max = Math.max(...contributing);
        const tolerance = 1e-6 * Math.max(1, Math.abs(min), Math.abs(max));
        expect(result).toBeGreaterThanOrEqual(min - tolerance);
        expect(result).toBeLessThanOrEqual(max + tolerance);
      }),
      { numRuns: 100 },
    );
  });
});

describe('weightedAvg documented edge cases', () => {
  it('returns 0 for an empty input', () => {
    expect(weightedAvg([], pickValue, pickWeight)).toBe(0);
  });

  it('returns the single value when one row carries all the weight', () => {
    const rows: WeightedRow[] = [{ value: 250, weight: 7 }];
    expect(weightedAvg(rows, pickValue, pickWeight)).toBe(250);
  });

  it('computes a worked request-weighted average', () => {
    // (100*1 + 200*3) / (1 + 3) = 700 / 4 = 175
    const rows: WeightedRow[] = [
      { value: 100, weight: 1 },
      { value: 200, weight: 3 },
    ];
    expect(weightedAvg(rows, pickValue, pickWeight)).toBe(175);
  });

  it('ignores zero-weight rows in the average', () => {
    // (10*0 + 50*2) / (0 + 2) = 100 / 2 = 50, the out-of-range 10 is ignored.
    const rows: WeightedRow[] = [
      { value: 10, weight: 0 },
      { value: 50, weight: 2 },
    ];
    expect(weightedAvg(rows, pickValue, pickWeight)).toBe(50);
  });
});
