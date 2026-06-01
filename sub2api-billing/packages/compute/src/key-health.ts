/**
 * API key health classifiers (design "Aggregation and Compute Library",
 * Properties 30 and 31; Requirements 12.4, 12.5, 12.6).
 *
 * Three pure, deterministic classifiers back the Key_Analysis_Page health
 * section:
 *
 * - {@link longUnusedKeys} — keys whose `last_request_at` is more than 14 days
 *   before the end of the selected Billing_Month (Requirement 12.4).
 * - {@link highFrequencyKeys} — the top keys by request count for the selected
 *   Billing_Month (Requirement 12.5).
 * - {@link abnormalGrowthKeys} — keys whose request count grew by at least
 *   200 percent relative to the immediately preceding Billing_Month
 *   (Requirement 12.6).
 *
 * {@link classifyKeyHealth} bundles all three into the single shape the UI
 * consumes. The module performs no I/O and depends only on its arguments. All
 * date math is performed in UTC so classification is independent of the host
 * machine's local timezone.
 */
import type { KeyUsageRecord } from './types/records.js';
import { topN } from './aggregation.js';

/** Milliseconds in one day, used for the idle-window threshold. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A key's request count, treating a missing (`null`) count as `0`. */
function requestCountOf(key: KeyUsageRecord): number {
  return key.request_count ?? 0;
}

/**
 * The last representable instant of a `YYYY-MM` Billing_Month (UTC).
 *
 * Computed as one millisecond before the first instant of the following month,
 * so it is the end of the selected month against which the long-unused idle
 * window is measured (Requirement 12.4). The month rollover (December → the
 * following January) is handled by `Date.UTC`.
 *
 * @param billingMonth - A Billing_Month in `YYYY-MM` form.
 * @returns The last UTC instant of that month.
 * @throws TypeError when `billingMonth` is not a `YYYY-MM` string.
 */
export function billingMonthEnd(billingMonth: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(billingMonth);
  if (!match) {
    throw new TypeError(`billingMonthEnd: expected a YYYY-MM Billing_Month, got "${billingMonth}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  // `month` (1-12) is the 0-based index of the *following* month, so this is
  // the first instant of next month; minus 1ms is the end of the selected one.
  return new Date(Date.UTC(year, month, 1) - 1);
}

/**
 * Long-unused keys: those idle for more than 14 days before the month end
 * (design Property 30, Requirement 12.4).
 *
 * A key is long-unused if and only if its `last_request_at` is strictly more
 * than `idleDays` days before {@link billingMonthEnd} of the selected
 * Billing_Month. Keys with a `null` `last_request_at` are excluded, because the
 * rule is defined by a comparison against that timestamp and there is no value
 * to compare.
 *
 * @param keys - The Key_Usage_Records for the selected Billing_Month.
 * @param billingMonth - The selected Billing_Month (`YYYY-MM`).
 * @param idleDays - The idle window in days; defaults to `14` (Requirement 12.4).
 * @returns The subset of `keys` classified as long-unused, in input order.
 */
export function longUnusedKeys(
  keys: readonly KeyUsageRecord[],
  billingMonth: string,
  idleDays = 14,
): KeyUsageRecord[] {
  const threshold = billingMonthEnd(billingMonth).getTime() - idleDays * MS_PER_DAY;
  return keys.filter(
    (key) => key.last_request_at !== null && key.last_request_at.getTime() < threshold,
  );
}

/**
 * High-frequency keys: the top keys by request count (Requirement 12.5).
 *
 * Ranks the keys by `request_count` (a missing count counts as `0`) in
 * descending order and returns at most `n` of them, reusing the shared
 * {@link topN} helper so the ranking semantics match the rest of the platform
 * (bounded, descending, complete when fewer than `n` keys exist, stable on
 * ties).
 *
 * @param keys - The Key_Usage_Records for the selected Billing_Month.
 * @param n - The maximum number of keys to return; defaults to `10`.
 * @returns Up to `n` keys ordered by request count descending.
 */
export function highFrequencyKeys(keys: readonly KeyUsageRecord[], n = 10): KeyUsageRecord[] {
  return topN(keys, requestCountOf, n);
}

/**
 * An abnormal-growth key together with the counts and growth that classified it.
 */
export interface AbnormalGrowthKey {
  /** A representative current-month Key_Usage_Record for the key. */
  key: KeyUsageRecord;
  /** The key's total request count in the selected Billing_Month. */
  currentRequestCount: number;
  /** The key's total request count in the preceding Billing_Month. */
  precedingRequestCount: number;
  /**
   * The relative increase as a percentage:
   * `(current - preceding) / preceding * 100`.
   */
  growthPercent: number;
}

/** Sum request counts per `api_key_id` across a month's key records. */
function requestCountsByKey(keys: readonly KeyUsageRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key.api_key_id, (counts.get(key.api_key_id) ?? 0) + requestCountOf(key));
  }
  return counts;
}

/**
 * Abnormal-growth keys: request count up by at least 200 percent month-over-month
 * (design Property 31, Requirement 12.6).
 *
 * Request counts are aggregated per `api_key_id` within each month. A key is
 * abnormal-growth if and only if its current-month request count increased by
 * at least `thresholdPercent` percent relative to its preceding-month count,
 * i.e. `(current - preceding) / preceding * 100 >= thresholdPercent`.
 *
 * A key whose preceding-month request count is `0` (including keys absent from
 * the preceding month) is excluded: the relative increase is undefined, which
 * mirrors the Dashboard's no-comparison handling when a preceding value is zero
 * (Requirement 4.10). Per Requirement 12.6 the caller only supplies preceding
 * records when more than one Billing_Month is available; with a single month
 * there are no abnormal-growth keys.
 *
 * @param current - Key_Usage_Records for the selected Billing_Month.
 * @param preceding - Key_Usage_Records for the immediately preceding Billing_Month.
 * @param thresholdPercent - The minimum growth percentage; defaults to `200`.
 * @returns The abnormal-growth keys, each with its counts and growth percentage,
 *   in first-seen order of the current-month records.
 */
export function abnormalGrowthKeys(
  current: readonly KeyUsageRecord[],
  preceding: readonly KeyUsageRecord[],
  thresholdPercent = 200,
): AbnormalGrowthKey[] {
  const precedingCounts = requestCountsByKey(preceding);

  // Aggregate the current month by key, keeping the first-seen record as the
  // representative for the result row.
  const currentAgg = new Map<string, { key: KeyUsageRecord; count: number }>();
  for (const key of current) {
    const existing = currentAgg.get(key.api_key_id);
    if (existing) {
      existing.count += requestCountOf(key);
    } else {
      currentAgg.set(key.api_key_id, { key, count: requestCountOf(key) });
    }
  }

  const result: AbnormalGrowthKey[] = [];
  for (const { key, count } of currentAgg.values()) {
    const precedingCount = precedingCounts.get(key.api_key_id) ?? 0;
    if (precedingCount <= 0) {
      continue; // undefined relative growth; no comparison possible
    }
    const growthPercent = ((count - precedingCount) / precedingCount) * 100;
    if (growthPercent >= thresholdPercent) {
      result.push({
        key,
        currentRequestCount: count,
        precedingRequestCount: precedingCount,
        growthPercent,
      });
    }
  }
  return result;
}

/** The three key-health classifications surfaced on the Key_Analysis_Page. */
export interface KeyHealth {
  /** Keys idle for more than 14 days before the month end (Requirement 12.4). */
  longUnused: KeyUsageRecord[];
  /** Top keys by request count (Requirement 12.5). */
  highFrequency: KeyUsageRecord[];
  /** Keys up >= 200% in request count vs the preceding month (Requirement 12.6). */
  abnormalGrowth: AbnormalGrowthKey[];
}

/** Inputs for {@link classifyKeyHealth}. */
export interface KeyHealthInput {
  /** Key_Usage_Records for the selected Billing_Month. */
  keys: readonly KeyUsageRecord[];
  /** The selected Billing_Month (`YYYY-MM`). */
  billingMonth: string;
  /**
   * Key_Usage_Records for the immediately preceding Billing_Month. Provide only
   * when more than one Billing_Month is available; when omitted there are no
   * abnormal-growth keys (Requirement 12.6).
   */
  precedingKeys?: readonly KeyUsageRecord[];
  /** Max high-frequency keys to return; defaults to `10`. */
  highFrequencyCount?: number;
  /** Long-unused idle window in days; defaults to `14`. */
  idleDays?: number;
  /** Abnormal-growth minimum growth percentage; defaults to `200`. */
  growthThresholdPercent?: number;
}

/**
 * Classify the API keys of a Billing_Month into the three health buckets the
 * Key_Analysis_Page renders (Requirements 12.4, 12.5, 12.6).
 *
 * Delegates to {@link longUnusedKeys}, {@link highFrequencyKeys}, and
 * {@link abnormalGrowthKeys}. The abnormal-growth bucket is empty unless
 * `precedingKeys` is supplied, matching Requirement 12.6's "more than one
 * Billing_Month is available" condition.
 *
 * @param input - The keys, selected Billing_Month, and optional tuning.
 * @returns The long-unused, high-frequency, and abnormal-growth classifications.
 */
export function classifyKeyHealth(input: KeyHealthInput): KeyHealth {
  const {
    keys,
    billingMonth,
    precedingKeys,
    highFrequencyCount = 10,
    idleDays = 14,
    growthThresholdPercent = 200,
  } = input;

  return {
    longUnused: longUnusedKeys(keys, billingMonth, idleDays),
    highFrequency: highFrequencyKeys(keys, highFrequencyCount),
    abnormalGrowth: precedingKeys
      ? abnormalGrowthKeys(keys, precedingKeys, growthThresholdPercent)
      : [],
  };
}
