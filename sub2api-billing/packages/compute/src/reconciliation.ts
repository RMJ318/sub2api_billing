/**
 * Reconciliation and unmatched-reference detection (design "Aggregation and
 * Compute Library", Properties 32 and 33; Requirements 21.1, 21.2, 21.3).
 *
 * Two pure, deterministic functions back the data integrity checks performed
 * during ingestion:
 *
 * - {@link reconcileDailyToMonthly} — associates daily usage records with the
 *   monthly summary by `user_id` + Billing_Month and flags a mismatch when
 *   the sum of daily `used_usd` differs from the monthly summary `used_usd`
 *   by more than a configurable threshold (default 1%) (Requirements 21.1, 21.2).
 *
 * - {@link detectUnmatchedReferences} — identifies Request_Detail_Records whose
 *   `api_key_id` has no matching Key_Usage_Record for the same Billing_Month
 *   (Requirement 21.3). Unmatched records are retained (never discarded) and
 *   the function returns log entries for each.
 *
 * This module performs no I/O and depends only on its arguments. All monetary
 * comparisons use `decimal.js` to avoid float drift.
 */
import { Decimal } from 'decimal.js';

import type { DailyUsageRecord, MonthlySummaryRecord, KeyUsageRecord, RequestDetailRecord } from './types/records.js';
import type { IngestionLogEntry } from './types/ingestion.js';

/**
 * A reconciliation discrepancy for a single user + Billing_Month pair.
 */
export interface ReconciliationDiscrepancy {
  userId: string;
  month: string;
  /** The sum of daily `used_usd` for this user + month. */
  dailySumUsd: Decimal;
  /** The monthly summary `used_usd` for this user + month. */
  monthlySummaryUsd: Decimal;
  /** The absolute relative difference as a percentage (e.g. 5.2 means 5.2%). */
  differencePercent: number;
}

/**
 * Result of daily-to-monthly reconciliation.
 */
export interface ReconciliationResult {
  /** Discrepancies where the difference exceeds the threshold. */
  discrepancies: ReconciliationDiscrepancy[];
  /** Structured ingestion log entries for each discrepancy. */
  logEntries: IngestionLogEntry[];
}

/**
 * An unmatched API key reference found in request_detail.
 */
export interface UnmatchedReference {
  requestId: string;
  apiKeyId: string;
  month: string;
}

/**
 * Result of unmatched-reference detection.
 */
export interface UnmatchedReferenceResult {
  /** The unmatched references found. */
  unmatchedReferences: UnmatchedReference[];
  /** Structured ingestion log entries for each unmatched reference. */
  logEntries: IngestionLogEntry[];
}

/**
 * Associate daily usage records with the monthly summary by `user_id` +
 * Billing_Month and flag mismatches where the sum of daily `used_usd` differs
 * from the monthly summary `used_usd` by more than the given threshold
 * (design Property 32, Requirements 21.1, 21.2).
 *
 * The mismatch criterion is the absolute relative difference:
 * `|dailySum - monthlySummary| / monthlySummary * 100 > thresholdPercent`
 *
 * When the monthly summary `used_usd` is zero or null, no discrepancy is
 * flagged (relative difference is undefined). When daily records for a user
 * sum to zero and the monthly summary is also zero, this is not a discrepancy.
 *
 * @param dailyRecords - The Daily_Usage_Records for the Billing_Month.
 * @param summaryRecords - The Monthly_Summary_Records for the Billing_Month.
 * @param thresholdPercent - The maximum acceptable relative difference percentage;
 *   defaults to `1` (1%) per Requirement 21.2.
 * @returns The reconciliation result with discrepancies and log entries.
 */
export function reconcileDailyToMonthly(
  dailyRecords: readonly DailyUsageRecord[],
  summaryRecords: readonly MonthlySummaryRecord[],
  thresholdPercent = 1,
): ReconciliationResult {
  // Build a lookup of monthly summary used_usd by composite key user_id + billing_month.
  const summaryMap = new Map<string, { userId: string; month: string; usedUsd: Decimal }>();
  for (const summary of summaryRecords) {
    if (summary.used_usd === null) continue;
    const key = `${summary.user_id}|${summary.billing_month}`;
    summaryMap.set(key, {
      userId: summary.user_id,
      month: summary.billing_month,
      usedUsd: summary.used_usd,
    });
  }

  // Aggregate daily used_usd by user_id + billing_month.
  const dailySums = new Map<string, Decimal>();
  for (const daily of dailyRecords) {
    if (daily.used_usd === null) continue;
    const key = `${daily.user_id}|${daily.billing_month}`;
    const current = dailySums.get(key) ?? new Decimal(0);
    dailySums.set(key, current.plus(daily.used_usd));
  }

  const discrepancies: ReconciliationDiscrepancy[] = [];
  const logEntries: IngestionLogEntry[] = [];

  // Compare each user+month that appears in the monthly summaries.
  for (const [key, summaryInfo] of summaryMap) {
    const dailySum = dailySums.get(key) ?? new Decimal(0);
    const monthlyUsd = summaryInfo.usedUsd;

    // Skip if the monthly summary is zero — relative difference is undefined.
    if (monthlyUsd.isZero()) continue;

    // Compute absolute relative difference percentage:
    // |dailySum - monthlySummary| / |monthlySummary| * 100
    const absDiff = dailySum.minus(monthlyUsd).abs();
    const relDiffPercent = absDiff.dividedBy(monthlyUsd.abs()).times(100).toNumber();

    if (relDiffPercent > thresholdPercent) {
      discrepancies.push({
        userId: summaryInfo.userId,
        month: summaryInfo.month,
        dailySumUsd: dailySum,
        monthlySummaryUsd: monthlyUsd,
        differencePercent: relDiffPercent,
      });
      logEntries.push({
        type: 'reconciliation',
        userId: summaryInfo.userId,
        month: summaryInfo.month,
        dailySum: dailySum.toString(),
        monthly: monthlyUsd.toString(),
      });
    }
  }

  return { discrepancies, logEntries };
}

/**
 * Detect Request_Detail_Records whose `api_key_id` has no matching
 * Key_Usage_Record for the same Billing_Month (design Property 33,
 * Requirement 21.3).
 *
 * Unmatched records are retained (never discarded) — the function only produces
 * log entries flagging the situation. Callers should keep all request detail
 * records regardless of whether they are matched.
 *
 * @param requestDetails - The Request_Detail_Records for the Billing_Month.
 * @param keyRecords - The Key_Usage_Records for the same Billing_Month.
 * @returns The unmatched reference result with entries and log entries.
 */
export function detectUnmatchedReferences(
  requestDetails: readonly RequestDetailRecord[],
  keyRecords: readonly KeyUsageRecord[],
): UnmatchedReferenceResult {
  // Build a set of known api_key_id values from Key_Usage_Records, keyed by
  // billing_month for cross-month safety.
  const knownKeys = new Set<string>();
  for (const keyRecord of keyRecords) {
    knownKeys.add(`${keyRecord.api_key_id}|${keyRecord.billing_month}`);
  }

  const unmatchedReferences: UnmatchedReference[] = [];
  const logEntries: IngestionLogEntry[] = [];

  // Track already-seen api_key_id + billing_month pairs to avoid duplicate log
  // entries for the same unmatched key reference within a month.
  const seen = new Set<string>();

  for (const detail of requestDetails) {
    const compositeKey = `${detail.api_key_id}|${detail.billing_month}`;
    if (!knownKeys.has(compositeKey) && !seen.has(compositeKey)) {
      seen.add(compositeKey);
      unmatchedReferences.push({
        requestId: detail.request_id,
        apiKeyId: detail.api_key_id,
        month: detail.billing_month,
      });
      logEntries.push({
        type: 'unmatched_reference',
        requestId: detail.request_id,
        apiKeyId: detail.api_key_id,
        month: detail.billing_month,
      });
    }
  }

  return { unmatchedReferences, logEntries };
}
