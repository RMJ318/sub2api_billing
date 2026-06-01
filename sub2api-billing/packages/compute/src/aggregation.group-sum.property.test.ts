import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { groupSum } from './index.js';

/**
 * Property 16: Dimensional group-sums preserve totals.
 *
 * For any set of records grouped by a dimension (Model_Family, model, API key,
 * or the treemap level user->model->key), the sum of each group's metric equals
 * the sum of that metric across the group's member records, and the sum across
 * all groups equals the grand total of that metric.
 *
 * These checks are decimal-exact: `groupSum` accumulates with `decimal.js`, so
 * the per-group and grand totals must match to the full fractional precision of
 * the source money values (e.g. `433.930721`) with no float drift.
 *
 * Validates: Requirements 5.3, 11.1, 11.2, 11.3, 12.1, 13.4
 */
describe('Property 16: groupSum preserves dimensional totals', () => {
  // A money value with exactly six fractional digits and a sign, mirroring the
  // up-to-6-digit USD precision in the source data. Built from a string so the
  // Decimal is exact and the bounded magnitude keeps cumulative sums well
  // within decimal.js precision (no rounding can occur).
  const money: fc.Arbitrary<Decimal> = fc
    .record({
      sign: fc.constantFrom('', '-'),
      intPart: fc.integer({ min: 0, max: 999_999 }),
      frac: fc.integer({ min: 0, max: 999_999 }),
    })
    .map(({ sign, intPart, frac }) => new Decimal(`${sign}${intPart}.${String(frac).padStart(6, '0')}`));

  // A grouping key drawn from a small domain so that many rows collide into the
  // same group, exercising real accumulation rather than singleton groups. The
  // string form stands in for a Model_Family / model / API key name or the
  // composite treemap key (user->model->key). Grouping uses Map equality
  // (SameValueZero).
  const key: fc.Arbitrary<string> = fc.constantFrom('a', 'b', 'c', 'd', 'e', '', 'user|gpt|key-1', 'user|claude|key-2');

  // An arbitrary keyed money row, the unit `groupSum` groups and sums over.
  const row = fc.record({ key, value: money });
  const rows = fc.array(row, { maxLength: 60 });

  /** Decimal-exact reference sum over a set of values (order-independent). */
  const total = (values: readonly Decimal[]): Decimal =>
    values.reduce((acc, v) => acc.plus(v), new Decimal(0));

  it("each group's total equals the decimal sum over its member rows", () => {
    fc.assert(
      fc.property(rows, (sample) => {
        const result = groupSum(sample, (r) => r.key, (r) => r.value);
        for (const [k, groupTotal] of result) {
          const members = sample.filter((r) => r.key === k).map((r) => r.value);
          expect(groupTotal.equals(total(members))).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('the sum across all groups equals the grand total of the metric', () => {
    fc.assert(
      fc.property(rows, (sample) => {
        const result = groupSum(sample, (r) => r.key, (r) => r.value);
        const sumOfGroups = total([...result.values()]);
        const grandTotal = total(sample.map((r) => r.value));
        expect(sumOfGroups.equals(grandTotal)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('produces exactly one group per distinct key, covering every row', () => {
    fc.assert(
      fc.property(rows, (sample) => {
        const result = groupSum(sample, (r) => r.key, (r) => r.value);
        const distinctKeys = new Set(sample.map((r) => r.key));
        expect(result.size).toBe(distinctKeys.size);
        for (const k of distinctKeys) {
          expect(result.has(k)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
