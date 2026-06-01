/**
 * Property 10: Records are partitioned by Billing_Month across folders
 * (design "Property 10", Requirement 1.8).
 *
 * For any set of records spanning multiple months loaded into the Data_Store
 * (across several `load` calls, as the Ingestion Service loads one monthly
 * folder at a time), a month-scoped query for month M returns exactly the
 * records whose Billing_Month equals M, every loaded record retains its
 * Billing_Month, the union over `availableMonths()` reconstructs all loaded
 * records, and `availableMonths()` is ascending and de-duplicated.
 *
 * Validates: Requirements 1.8
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  MonthlySummaryRecord,
  DailyUsageRecord,
  ModelUsageRecord,
  KeyUsageRecord,
} from '@core/compute';
import { InMemoryRecordStore } from './record-store.js';

// A small pool of YYYY-MM months so that arbitrary records collide across a
// handful of months (forcing genuine multi-month partitioning). For YYYY-MM,
// lexicographic order is also chronological order.
const monthArb = fc.constantFrom(
  '2025-09',
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
);

// A month never present in the pool, used to assert that querying an absent
// month yields no records.
const ABSENT_MONTH = '1900-01';

// --- Record factories: full records that are all-null except the required
// fields, with `user_id` carrying the unique id so distinct records stay
// distinguishable in counterexamples. ---

function makeSummary(month: string, uid: string): MonthlySummaryRecord {
  return {
    billing_month: month,
    user_id: uid,
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: null,
    used_usd: null,
    remaining_monthly_limit_usd: null,
    usage_percent: null,
    request_count: null,
    api_key_count: null,
    active_days: null,
    input_tokens: null,
    output_tokens: null,
    cache_creation_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    image_count: null,
    input_cost_usd: null,
    output_cost_usd: null,
    cache_creation_cost_usd: null,
    cache_read_cost_usd: null,
    image_output_cost_usd: null,
    actual_cost_usd: null,
    avg_duration_ms: null,
    avg_first_token_ms: null,
    first_request_at: null,
    last_request_at: null,
  };
}

function makeDaily(month: string, uid: string): DailyUsageRecord {
  return {
    billing_month: month,
    usage_date: new Date(`${month}-01T00:00:00Z`),
    user_id: uid,
    email: null,
    username: null,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
  };
}

function makeModel(month: string, uid: string): ModelUsageRecord {
  return {
    billing_month: month,
    user_id: uid,
    email: null,
    username: null,
    model: `model-${uid}`,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    cache_creation_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
  };
}

function makeKey(month: string, uid: string): KeyUsageRecord {
  return {
    billing_month: month,
    user_id: uid,
    email: null,
    username: null,
    api_key_id: `key-${uid}`,
    api_key_name: null,
    api_key_status: null,
    api_key_deleted: null,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    first_request_at: null,
    last_request_at: null,
  };
}

// One generated record placement: which month it belongs to and which load
// batch (monthly folder) it arrives in. Up to 5 batches forces records of the
// same month to be spread across multiple `load` calls.
const placementArb = fc.record({ month: monthArb, batch: fc.nat({ max: 4 }) });

// A full load plan across the four small record sets.
const planArb = fc.record({
  summaries: fc.array(placementArb, { maxLength: 20 }),
  daily: fc.array(placementArb, { maxLength: 20 }),
  model: fc.array(placementArb, { maxLength: 20 }),
  key: fc.array(placementArb, { maxLength: 20 }),
});

// A built record paired with the month it should be partitioned under.
interface Built<T> {
  month: string;
  record: T;
}

/** Assert `a` and `b` contain exactly the same elements, compared by identity. */
function sameMembers<T>(a: readonly T[], b: readonly T[]): void {
  expect(a.length).toBe(b.length);
  const bSet = new Set<T>(b);
  for (const x of a) {
    expect(bSet.has(x)).toBe(true);
  }
}

/**
 * Assert the partitioning contract for one record set: every queried month M
 * returns exactly the built records whose month is M (by identity), each
 * returned record retains `billing_month === M`, an absent month returns empty,
 * and the union over `availableMonths()` reconstructs all built records.
 */
function assertPartitioned<T extends { billing_month: string }>(
  built: readonly Built<T>[],
  accessor: (month: string) => T[],
  availableMonths: readonly string[],
): void {
  const monthsPresent = new Set(built.map((b) => b.month));

  for (const month of monthsPresent) {
    const expected = built.filter((b) => b.month === month).map((b) => b.record);
    const actual = accessor(month);
    sameMembers(actual, expected);
    // Every returned record retains its Billing_Month equal to the query.
    expect(actual.every((r) => r.billing_month === month)).toBe(true);
  }

  // A month with no records yields an empty array.
  expect(accessor(ABSENT_MONTH)).toEqual([]);

  // The union across every available month reconstructs all loaded records.
  const union = availableMonths.flatMap((month) => accessor(month));
  sameMembers(
    union,
    built.map((b) => b.record),
  );
}

describe('Property 10: records are partitioned by Billing_Month across folders', () => {
  it('partitions every record set by month and lists months ascending and de-duplicated', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        // Build distinct records, tagging each with a globally-unique id.
        let counter = 0;
        const nextUid = (): string => `r${counter++}`;

        const builtSummaries: Built<MonthlySummaryRecord>[] = plan.summaries.map((p) => ({
          month: p.month,
          record: makeSummary(p.month, nextUid()),
        }));
        const builtDaily: Built<DailyUsageRecord>[] = plan.daily.map((p) => ({
          month: p.month,
          record: makeDaily(p.month, nextUid()),
        }));
        const builtModel: Built<ModelUsageRecord>[] = plan.model.map((p) => ({
          month: p.month,
          record: makeModel(p.month, nextUid()),
        }));
        const builtKey: Built<KeyUsageRecord>[] = plan.key.map((p) => ({
          month: p.month,
          record: makeKey(p.month, nextUid()),
        }));

        // Load across multiple batches (monthly folders), accumulating records.
        const store = new InMemoryRecordStore();
        const batchIds = [
          ...new Set(
            [...plan.summaries, ...plan.daily, ...plan.model, ...plan.key].map((p) => p.batch),
          ),
        ];
        for (const batch of batchIds) {
          store.load({
            monthlySummaries: plan.summaries
              .map((p, i) => ({ p, built: builtSummaries[i]! }))
              .filter(({ p }) => p.batch === batch)
              .map(({ built }) => built.record),
            dailyUsage: plan.daily
              .map((p, i) => ({ p, built: builtDaily[i]! }))
              .filter(({ p }) => p.batch === batch)
              .map(({ built }) => built.record),
            modelUsage: plan.model
              .map((p, i) => ({ p, built: builtModel[i]! }))
              .filter(({ p }) => p.batch === batch)
              .map(({ built }) => built.record),
            keyUsage: plan.key
              .map((p, i) => ({ p, built: builtKey[i]! }))
              .filter(({ p }) => p.batch === batch)
              .map(({ built }) => built.record),
          });
        }

        const months = store.availableMonths();

        // availableMonths is de-duplicated and ascending.
        expect(months).toEqual([...new Set(months)]);
        expect(months).toEqual([...months].sort());

        // availableMonths equals exactly the distinct months across all sets.
        const expectedMonths = [
          ...new Set([
            ...builtSummaries.map((b) => b.month),
            ...builtDaily.map((b) => b.month),
            ...builtModel.map((b) => b.month),
            ...builtKey.map((b) => b.month),
          ]),
        ].sort();
        expect(months).toEqual(expectedMonths);

        // Each record set is partitioned correctly and fully reconstructible.
        assertPartitioned(builtSummaries, (m) => store.monthlySummaries(m), months);
        assertPartitioned(builtDaily, (m) => store.dailyUsage(m), months);
        assertPartitioned(builtModel, (m) => store.modelUsage(m), months);
        assertPartitioned(builtKey, (m) => store.keyUsage(m), months);
      }),
      { numRuns: 100 },
    );
  });
});
