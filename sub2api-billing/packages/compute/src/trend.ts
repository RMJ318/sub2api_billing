/**
 * Time-bucketed trend aggregation (design "Aggregation and Compute Library",
 * Property 17).
 *
 * Collapses a set of dated usage records into a trend series: one point per
 * occupied time bucket, ordered ascending by time, whose value is the sum of a
 * chosen metric over the records that fall in that bucket. This single helper
 * backs every line-chart trend in the spec:
 *
 * - Dashboard daily trends — daily Spend / requests / tokens over
 *   Daily_Usage_Records by `usage_date` (Requirement 5.1).
 * - Per-user daily trend — the same, pre-filtered to a single `user_id`
 *   (Requirement 10.1).
 * - API key daily trends — all-keys and single-key daily series
 *   (Requirements 12.2, 12.3).
 * - Cost trend with selectable daily / weekly / monthly granularity
 *   (Requirements 13.1, 13.2, 13.3): daily and weekly aggregate
 *   Daily_Usage_Records by `usage_date`, monthly aggregates
 *   Monthly_Summary_Records by Billing_Month.
 *
 * Because the function accepts already-filtered records, the "single user" and
 * "single API key" series are just the same aggregation applied to a
 * pre-filtered slice — no special-casing is required (Property 17).
 *
 * Bucketing rules (all computed in UTC so the series is deterministic and
 * independent of the host machine's local timezone):
 *
 * - **daily** — one bucket per calendar day of the record's date, keyed
 *   `YYYY-MM-DD`.
 * - **weekly** — one bucket per ISO 8601 week (weeks start Monday; a week
 *   belongs to the year containing its Thursday), keyed `GGGG-Www` where
 *   `GGGG` is the ISO week-numbering year and `ww` the zero-padded week number.
 * - **monthly** — one bucket per Billing_Month, keyed by the `YYYY-MM` string
 *   itself (Requirement 13.3).
 *
 * Money is summed with `decimal.js` to preserve the up-to-6-digit fractional
 * precision in the source data and avoid float drift (Requirements 2.3, 21);
 * count metrics (request / token counts) are summed by wrapping the count in a
 * `Decimal` at the call site, which is exact for integers.
 */
import { Decimal } from 'decimal.js';

/** Selectable trend granularity (Requirement 13.1). */
export type TrendGranularity = 'daily' | 'weekly' | 'monthly';

/**
 * One point of a trend series: a single occupied time bucket and its summed
 * metric.
 */
export interface TrendPoint {
  /**
   * The bucket's sortable key / chart label: `YYYY-MM-DD` (daily),
   * `GGGG-Www` (weekly, ISO week-numbering year + week), or `YYYY-MM`
   * (monthly).
   */
  bucket: string;
  /**
   * The representative UTC start instant of the bucket — the day's midnight
   * (daily), the week's Monday midnight (weekly), or the first of the month at
   * midnight (monthly). Points are ordered ascending by this instant.
   */
  start: Date;
  /** The decimal sum of the chosen metric over the records in this bucket. */
  value: Decimal;
}

/**
 * How to bucket and measure records for {@link aggregateTrend}.
 *
 * For `daily` and `weekly` granularity the `date` selector is required (the
 * record's `usage_date`); for `monthly` granularity the `billingMonth`
 * selector is required (the record's `YYYY-MM` Billing_Month). `metric`
 * selects the `Decimal` value summed within each bucket.
 *
 * @typeParam T - The dated record type (e.g. `DailyUsageRecord`).
 */
export interface TrendOptions<T> {
  /** The granularity that determines how records are bucketed. */
  granularity: TrendGranularity;
  /** Selects the record's date; required for `daily` and `weekly`. */
  date?: (r: T) => Date;
  /** Selects the record's Billing_Month (`YYYY-MM`); required for `monthly`. */
  billingMonth?: (r: T) => string;
  /** Selects the `Decimal` metric to sum within a bucket. */
  metric: (r: T) => Decimal;
}

/** A bucket descriptor: its stable key plus its representative UTC start. */
interface Bucket {
  key: string;
  start: Date;
}

/** UTC midnight of the calendar day containing `date`. */
function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Daily bucket: keyed `YYYY-MM-DD`, starting at that day's UTC midnight. */
function dailyBucket(date: Date): Bucket {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const key = `${pad4(y)}-${pad2(m)}-${pad2(d)}`;
  return { key, start: utcDayStart(date) };
}

/**
 * Weekly bucket using the ISO 8601 week (Monday-start, week-numbering year).
 *
 * The bucket key is `GGGG-Www` (ISO week-numbering year and zero-padded week
 * number) and the start instant is the Monday 00:00:00 UTC of that week, so
 * every date in the same ISO week shares one bucket and distinct weeks sort by
 * their Monday.
 */
function weeklyBucket(date: Date): Bucket {
  const day = utcDayStart(date);
  // ISO weekday: Monday = 1 .. Sunday = 7.
  const isoDow = day.getUTCDay() === 0 ? 7 : day.getUTCDay();

  // Monday of this ISO week: step back to the start of the week.
  const monday = new Date(day);
  monday.setUTCDate(monday.getUTCDate() - (isoDow - 1));

  // The week-numbering year and week are taken from the week's Thursday.
  const thursday = new Date(day);
  thursday.setUTCDate(thursday.getUTCDate() + (4 - isoDow));
  const weekYear = thursday.getUTCFullYear();
  const firstThursdayBasis = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - firstThursdayBasis.getTime()) / 86_400_000 + 1) / 7,
  );

  return { key: `${pad4(weekYear)}-W${pad2(week)}`, start: monday };
}

/**
 * Monthly bucket keyed by the Billing_Month string (Requirement 13.3),
 * starting at the first of that month at UTC midnight.
 *
 * Billing_Month is `YYYY-MM` by construction; a value that does not match that
 * shape keeps its raw string as the key and falls back to the Unix epoch for
 * its start instant so ordering degrades to the bucket key rather than failing.
 */
function monthlyBucket(billingMonth: string): Bucket {
  const match = /^(\d{4})-(\d{2})$/.exec(billingMonth);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]); // 1-12
    return { key: billingMonth, start: new Date(Date.UTC(year, month - 1, 1)) };
  }
  return { key: billingMonth, start: new Date(0) };
}

/** Zero-pad a (non-negative) year to four digits for stable lexical keys. */
function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** Zero-pad a one/two digit number for stable lexical keys. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Aggregate dated records into an ascending trend series (design Property 17).
 *
 * Buckets `records` by the chosen `granularity`, sums `options.metric` within
 * each occupied bucket using decimal arithmetic, and returns one
 * {@link TrendPoint} per occupied bucket ordered ascending by the bucket's
 * start instant. Empty buckets are not represented (only occupied buckets
 * appear), and the grand total of all points' values equals the sum of the
 * metric over every input record.
 *
 * Passing a pre-filtered slice (e.g. a single `user_id` or `api_key_id`)
 * yields that entity's series with no special handling (Requirements 10.1,
 * 12.3).
 *
 * @typeParam T - The dated record type.
 * @param records - The records to aggregate (in any order).
 * @param options - Granularity, the date/Billing_Month selector it requires,
 *   and the `Decimal` metric to sum.
 * @returns One point per occupied bucket, ordered ascending by `start`.
 * @throws TypeError when the selector required by the granularity is missing
 *   (`date` for daily/weekly, `billingMonth` for monthly).
 */
export function aggregateTrend<T>(
  records: readonly T[],
  options: TrendOptions<T>,
): TrendPoint[] {
  const { granularity, date, billingMonth, metric } = options;

  const bucketOf: (r: T) => Bucket = (() => {
    if (granularity === 'monthly') {
      if (!billingMonth) {
        throw new TypeError("aggregateTrend: 'billingMonth' selector is required for monthly granularity");
      }
      return (r) => monthlyBucket(billingMonth(r));
    }
    if (!date) {
      throw new TypeError(`aggregateTrend: 'date' selector is required for ${granularity} granularity`);
    }
    const toBucket = granularity === 'weekly' ? weeklyBucket : dailyBucket;
    return (r) => toBucket(date(r));
  })();

  // Group metric sums by bucket key, retaining each bucket's start instant.
  const sums = new Map<string, { start: Date; value: Decimal }>();
  for (const record of records) {
    const bucket = bucketOf(record);
    const existing = sums.get(bucket.key);
    if (existing) {
      existing.value = existing.value.plus(metric(record));
    } else {
      sums.set(bucket.key, { start: bucket.start, value: metric(record) });
    }
  }

  const points: TrendPoint[] = [];
  for (const [bucket, { start, value }] of sums) {
    points.push({ bucket, start, value });
  }

  // Ascending by time; tie-break on the bucket key for total determinism.
  points.sort((a, b) => {
    const byTime = a.start.getTime() - b.start.getTime();
    if (byTime !== 0) {
      return byTime;
    }
    return a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0;
  });

  return points;
}
