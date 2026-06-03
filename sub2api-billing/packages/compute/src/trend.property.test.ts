import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { aggregateTrend } from './trend.js';
import type { TrendGranularity } from './trend.js';

/**
 * Property 17: Time-bucketed trends sum per bucket in ascending order.
 *
 * For any set of dated usage records and a chosen granularity (daily by
 * `usage_date`, weekly, or monthly by Billing_Month), the trend series contains
 * one point per occupied bucket ordered ascending by time, and each point's
 * value equals the sum of the metric over the records in that bucket — including
 * when records are pre-filtered to a single user or a single API key.
 *
 * Validates: Requirements 5.1, 10.1, 12.2, 12.3, 13.1, 13.2, 13.3
 */
describe('Property 17: Time-bucketed trends sum per bucket in ascending order', () => {
  // --- Arbitraries ---

  /** A non-negative money value with up to 6 fractional digits. */
  const money: fc.Arbitrary<Decimal> = fc
    .record({
      intPart: fc.integer({ min: 0, max: 99_999 }),
      frac: fc.integer({ min: 0, max: 999_999 }),
    })
    .map(({ intPart, frac }) => new Decimal(`${intPart}.${String(frac).padStart(6, '0')}`));

  /** A date within a realistic billing range (2025-01 to 2026-12), at UTC midnight. */
  const usageDate: fc.Arbitrary<Date> = fc
    .integer({ min: 0, max: 730 }) // offset in days from 2025-01-01
    .map((offset) => {
      const base = new Date(Date.UTC(2025, 0, 1));
      base.setUTCDate(base.getUTCDate() + offset);
      return base;
    });

  /** A valid Billing_Month string drawn from a small set so buckets collide. */
  const billingMonth: fc.Arbitrary<string> = fc.constantFrom(
    '2025-01', '2025-02', '2025-03', '2025-06', '2025-12',
    '2026-01', '2026-04', '2026-05', '2026-11',
  );

  /** A user ID from a small domain so pre-filtering produces non-trivial subsets. */
  const userId: fc.Arbitrary<string> = fc.constantFrom('u1', 'u2', 'u3', 'u4');

  /** A dated record for daily/weekly granularity tests. */
  interface DatedRecord {
    usage_date: Date;
    user_id: string;
    value: Decimal;
  }

  const datedRecord: fc.Arbitrary<DatedRecord> = fc.record({
    usage_date: usageDate,
    user_id: userId,
    value: money,
  });

  const datedRecords: fc.Arbitrary<DatedRecord[]> = fc.array(datedRecord, { minLength: 1, maxLength: 50 });

  /** A monthly record for monthly granularity tests. */
  interface MonthlyRecord {
    billing_month: string;
    user_id: string;
    value: Decimal;
  }

  const monthlyRecord: fc.Arbitrary<MonthlyRecord> = fc.record({
    billing_month: billingMonth,
    user_id: userId,
    value: money,
  });

  const monthlyRecords: fc.Arbitrary<MonthlyRecord[]> = fc.array(monthlyRecord, { minLength: 1, maxLength: 50 });

  /** Granularity restricted to daily/weekly (those that use the date selector). */
  const dateGranularity: fc.Arbitrary<TrendGranularity> = fc.constantFrom('daily', 'weekly');

  // --- Helpers ---

  /** Decimal-exact sum. */
  const sum = (values: readonly Decimal[]): Decimal =>
    values.reduce((acc, v) => acc.plus(v), new Decimal(0));

  // --- Properties ---

  it('points are ordered ascending by their start instant (daily/weekly)', () => {
    fc.assert(
      fc.property(datedRecords, dateGranularity, (records, granularity) => {
        const points = aggregateTrend(records, {
          granularity,
          date: (r) => r.usage_date,
          metric: (r) => r.value,
        });

        for (let i = 1; i < points.length; i++) {
          expect(points[i].start.getTime()).toBeGreaterThan(points[i - 1].start.getTime());
        }
      }),
      { numRuns: 100 },
    );
  });

  it('points are ordered ascending by their start instant (monthly)', () => {
    fc.assert(
      fc.property(monthlyRecords, (records) => {
        const points = aggregateTrend(records, {
          granularity: 'monthly',
          billingMonth: (r) => r.billing_month,
          metric: (r) => r.value,
        });

        for (let i = 1; i < points.length; i++) {
          expect(points[i].start.getTime()).toBeGreaterThan(points[i - 1].start.getTime());
        }
      }),
      { numRuns: 100 },
    );
  });

  it('the sum of all point values equals the sum of all input record metrics - no data loss (daily/weekly)', () => {
    fc.assert(
      fc.property(datedRecords, dateGranularity, (records, granularity) => {
        const points = aggregateTrend(records, {
          granularity,
          date: (r) => r.usage_date,
          metric: (r) => r.value,
        });

        const pointsTotal = sum(points.map((p) => p.value));
        const inputTotal = sum(records.map((r) => r.value));
        expect(pointsTotal.equals(inputTotal)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('the sum of all point values equals the sum of all input record metrics - no data loss (monthly)', () => {
    fc.assert(
      fc.property(monthlyRecords, (records) => {
        const points = aggregateTrend(records, {
          granularity: 'monthly',
          billingMonth: (r) => r.billing_month,
          metric: (r) => r.value,
        });

        const pointsTotal = sum(points.map((p) => p.value));
        const inputTotal = sum(records.map((r) => r.value));
        expect(pointsTotal.equals(inputTotal)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("each bucket's value equals the sum of its constituent records' metrics (daily/weekly)", () => {
    fc.assert(
      fc.property(datedRecords, dateGranularity, (records, granularity) => {
        const points = aggregateTrend(records, {
          granularity,
          date: (r) => r.usage_date,
          metric: (r) => r.value,
        });

        // Reconstruct bucket membership: run the same aggregation on each record
        // to determine its bucket key, then verify per-bucket sums.
        const bucketSums = new Map<string, Decimal>();
        for (const r of records) {
          // Produce the same bucket key by running the function on a single record.
          const single = aggregateTrend([r], {
            granularity,
            date: (rec) => rec.usage_date,
            metric: (rec) => rec.value,
          });
          const key = single[0].bucket;
          const existing = bucketSums.get(key) ?? new Decimal(0);
          bucketSums.set(key, existing.plus(r.value));
        }

        for (const point of points) {
          const expected = bucketSums.get(point.bucket)!;
          expect(point.value.equals(expected)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("each bucket's value equals the sum of its constituent records' metrics (monthly)", () => {
    fc.assert(
      fc.property(monthlyRecords, (records) => {
        const points = aggregateTrend(records, {
          granularity: 'monthly',
          billingMonth: (r) => r.billing_month,
          metric: (r) => r.value,
        });

        // Monthly granularity: the bucket key is just the billing_month string.
        const bucketSums = new Map<string, Decimal>();
        for (const r of records) {
          const existing = bucketSums.get(r.billing_month) ?? new Decimal(0);
          bucketSums.set(r.billing_month, existing.plus(r.value));
        }

        for (const point of points) {
          const expected = bucketSums.get(point.bucket)!;
          expect(point.value.equals(expected)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('only occupied buckets are represented - no empty/zero buckets', () => {
    fc.assert(
      fc.property(datedRecords, dateGranularity, (records, granularity) => {
        const points = aggregateTrend(records, {
          granularity,
          date: (r) => r.usage_date,
          metric: (r) => r.value,
        });

        // Number of distinct bucket keys determined by single-record bucketing.
        const bucketKeys = new Set<string>();
        for (const r of records) {
          const single = aggregateTrend([r], {
            granularity,
            date: (rec) => rec.usage_date,
            metric: (rec) => rec.value,
          });
          bucketKeys.add(single[0].bucket);
        }

        // Exactly one point per occupied bucket, no more.
        expect(points.length).toBe(bucketKeys.size);
        // No points for days/weeks with no records (vacuously true by the check
        // above: the point set covers exactly the occupied buckets).
      }),
      { numRuns: 100 },
    );
  });

  it('only occupied buckets are represented - no empty/zero buckets (monthly)', () => {
    fc.assert(
      fc.property(monthlyRecords, (records) => {
        const points = aggregateTrend(records, {
          granularity: 'monthly',
          billingMonth: (r) => r.billing_month,
          metric: (r) => r.value,
        });

        const distinctMonths = new Set(records.map((r) => r.billing_month));
        expect(points.length).toBe(distinctMonths.size);
      }),
      { numRuns: 100 },
    );
  });

  it('pre-filtered single-user series preserves all properties (daily)', () => {
    fc.assert(
      fc.property(datedRecords, (records) => {
        // Pick the first user as the filter target.
        const targetUser = records[0].user_id;
        const filtered = records.filter((r) => r.user_id === targetUser);

        const points = aggregateTrend(filtered, {
          granularity: 'daily',
          date: (r) => r.usage_date,
          metric: (r) => r.value,
        });

        // Ascending order
        for (let i = 1; i < points.length; i++) {
          expect(points[i].start.getTime()).toBeGreaterThan(points[i - 1].start.getTime());
        }

        // Sum preservation
        const pointsTotal = sum(points.map((p) => p.value));
        const filteredTotal = sum(filtered.map((r) => r.value));
        expect(pointsTotal.equals(filteredTotal)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
