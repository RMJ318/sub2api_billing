/**
 * In-memory record sets indexed by Billing_Month (Requirement 1.8, design
 * "Data Store").
 *
 * The four small, pre-aggregated CSV sources — `monthly_user_summary.csv`,
 * `daily_user_usage.csv`, `model_user_usage.csv`, and `api_key_usage.csv` —
 * are held entirely in memory because their combined size is trivial and pure
 * aggregation over arrays is the cleanest, most testable query path. (The large
 * `request_detail.csv` lives only in DuckDB and is queried server-side; that
 * path is implemented separately.)
 *
 * Records are grouped by their `billing_month` so month-scoped queries are O(1)
 * lookups, while every record keeps its own `billing_month` field intact so the
 * same store also answers cross-month queries (design Property 10). Records can
 * be loaded from multiple monthly folders into a single store and remain
 * partitioned by month.
 *
 * This module holds only the in-memory record sets and their month-scoped
 * accessors; the DuckDB-backed `request_detail` query path is a separate concern.
 *
 * @see design "Data Store" — `monthlySummaries`/`dailyUsage`/`modelUsage`/
 *      `keyUsage`/`availableMonths`.
 */
import type {
  MonthlySummaryRecord,
  DailyUsageRecord,
  ModelUsageRecord,
  KeyUsageRecord,
} from '@core/compute';

/**
 * A batch of normalized records to load into the store. Every field is
 * optional so a caller (e.g. the Ingestion Service) can load one file type at a
 * time, and `load` can be called repeatedly to accumulate records across
 * monthly folders.
 */
export interface RecordSets {
  monthlySummaries?: readonly MonthlySummaryRecord[];
  dailyUsage?: readonly DailyUsageRecord[];
  modelUsage?: readonly ModelUsageRecord[];
  keyUsage?: readonly KeyUsageRecord[];
}

/**
 * Append every record into a per-month bucket within `index`, keyed by the
 * record's own `billing_month`. The record is stored as-is, so its
 * Billing_Month is retained for later cross-month queries.
 */
function indexByMonth<T extends { billing_month: string }>(
  index: Map<string, T[]>,
  records: readonly T[] | undefined,
): void {
  if (records === undefined) {
    return;
  }
  for (const record of records) {
    const month = record.billing_month;
    const bucket = index.get(month);
    if (bucket === undefined) {
      index.set(month, [record]);
    } else {
      bucket.push(record);
    }
  }
}

/**
 * Return a shallow copy of the records stored for `month`, or an empty array
 * when no records exist for that month. A copy is returned so callers cannot
 * mutate the store's internal buckets.
 */
function recordsForMonth<T>(index: Map<string, T[]>, month: string): T[] {
  const bucket = index.get(month);
  return bucket === undefined ? [] : bucket.slice();
}

/**
 * Holds the four small record sets in memory, partitioned by Billing_Month.
 *
 * Construct empty and {@link InMemoryRecordStore.load | load} records (the
 * Ingestion Service loads one folder/file at a time), or pass initial records
 * to the constructor. Month-scoped accessors return exactly the records whose
 * `billing_month` equals the requested month; {@link InMemoryRecordStore.availableMonths}
 * lists every month present across all four sets in ascending order.
 */
export class InMemoryRecordStore {
  readonly #monthlySummaries = new Map<string, MonthlySummaryRecord[]>();
  readonly #dailyUsage = new Map<string, DailyUsageRecord[]>();
  readonly #modelUsage = new Map<string, ModelUsageRecord[]>();
  readonly #keyUsage = new Map<string, KeyUsageRecord[]>();

  /**
   * @param initial - Optional records to load immediately, equivalent to
   *   constructing an empty store and calling {@link load} once.
   */
  constructor(initial?: RecordSets) {
    if (initial !== undefined) {
      this.load(initial);
    }
  }

  /**
   * Load a batch of records into the store, grouping each by its own
   * `billing_month`. Safe to call repeatedly to accumulate records from
   * multiple monthly folders; later calls add to (never replace) what is
   * already held.
   *
   * @param records - The record sets to add; any subset of the four types.
   */
  load(records: RecordSets): void {
    indexByMonth(this.#monthlySummaries, records.monthlySummaries);
    indexByMonth(this.#dailyUsage, records.dailyUsage);
    indexByMonth(this.#modelUsage, records.modelUsage);
    indexByMonth(this.#keyUsage, records.keyUsage);
  }

  /**
   * The Monthly_Summary_Records whose Billing_Month equals `month`.
   * @returns A fresh array (empty when the month has no records).
   */
  monthlySummaries(month: string): MonthlySummaryRecord[] {
    return recordsForMonth(this.#monthlySummaries, month);
  }

  /**
   * The Daily_Usage_Records whose Billing_Month equals `month`.
   * @returns A fresh array (empty when the month has no records).
   */
  dailyUsage(month: string): DailyUsageRecord[] {
    return recordsForMonth(this.#dailyUsage, month);
  }

  /**
   * The Model_Usage_Records whose Billing_Month equals `month`.
   * @returns A fresh array (empty when the month has no records).
   */
  modelUsage(month: string): ModelUsageRecord[] {
    return recordsForMonth(this.#modelUsage, month);
  }

  /**
   * The Key_Usage_Records whose Billing_Month equals `month`.
   * @returns A fresh array (empty when the month has no records).
   */
  keyUsage(month: string): KeyUsageRecord[] {
    return recordsForMonth(this.#keyUsage, month);
  }

  /**
   * Every Billing_Month present across any of the four record sets, in
   * ascending order. Because Billing_Month is `YYYY-MM`, lexicographic order is
   * also chronological order.
   *
   * @returns A sorted, de-duplicated list of months (empty when nothing is
   *   loaded).
   */
  availableMonths(): string[] {
    const months = new Set<string>();
    for (const month of this.#monthlySummaries.keys()) {
      months.add(month);
    }
    for (const month of this.#dailyUsage.keys()) {
      months.add(month);
    }
    for (const month of this.#modelUsage.keys()) {
      months.add(month);
    }
    for (const month of this.#keyUsage.keys()) {
      months.add(month);
    }
    return [...months].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
}
