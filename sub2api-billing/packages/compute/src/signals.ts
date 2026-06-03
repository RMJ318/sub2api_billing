/**
 * Signal Engine — pure detection rules (design "Signal Engine",
 * Requirements 16.2, 17.1–17.6, Properties 36–41).
 *
 * Five detection rules evaluate pre-aggregated usage data and emit typed
 * {@link Signal} objects with a group, severity, human-readable message, and
 * navigation target. Every rule is a pure function; the composite
 * {@link detectSignals} combines them into a single signal list.
 *
 * Rules and their severity/group (Requirement 17.6):
 *
 * | Rule                | Group                    | Severity      | Trigger                                      |
 * |---------------------|--------------------------|---------------|----------------------------------------------|
 * | High-spend          | high_spend               | warning       | Day spend > 20% of user's monthly limit      |
 * | Low-balance         | low_balance              | critical      | Remaining ≤ 10% of user's monthly limit      |
 * | API key anomaly     | api_key_anomaly          | warning       | Key day requests > 3× key daily average      |
 * | Response-time       | response_time_anomaly    | informational | avg_duration_ms > 60 000 ms                  |
 * | Risk hint           | risk_hint                | critical      | ≥ 2 consecutive high-spend days              |
 */
import type { Decimal } from 'decimal.js';
import type {
  DailyUsageRecord,
  MonthlySummaryRecord,
  Signal,
  SignalGroup,
  Severity,
} from './types/index.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Format a Date to a YYYY-MM-DD string for display in messages. */
function formatDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Generate a deterministic signal id from its components. */
function signalId(group: SignalGroup, ...parts: string[]): string {
  return `${group}:${parts.join(':')}`;
}

// ─── Detection Input ────────────────────────────────────────────────────────

/**
 * Input shape for {@link detectSignals}.
 *
 * - `summaries` — Monthly_Summary_Records for the selected Billing_Month.
 *   Used for low-balance detection and response-time anomaly, and to look up
 *   per-user budget limits for high-spend and risk-hint rules.
 * - `daily` — Daily_Usage_Records for the selected Billing_Month.
 *   Used for high-spend and risk-hint rules.
 * - `keyDailyRequestCounts` — A map from `api_key_id` to an array of daily
 *   request counts for each day the key was active. Used for the API key
 *   anomaly rule.
 */
export interface DetectSignalsInput {
  summaries: readonly MonthlySummaryRecord[];
  daily: readonly DailyUsageRecord[];
  keyDailyRequestCounts: ReadonlyMap<string, readonly number[]>;
}

// ─── Individual Rule Functions ──────────────────────────────────────────────

/**
 * High-spend signals: a user's single-day Spend exceeds 20% of their
 * Monthly_Budget_Limit (Requirement 17.1).
 *
 * Severity: **warning**. Group: **high_spend**.
 * Navigation target: User Analysis page → user entity.
 */
export function detectHighSpend(
  daily: readonly DailyUsageRecord[],
  summaries: readonly MonthlySummaryRecord[],
): Signal[] {
  // Build a lookup of per-user monthly budget limit.
  const limitByUser = new Map<string, Decimal>();
  for (const s of summaries) {
    if (s.monthly_limit_usd !== null && s.monthly_limit_usd.gt(0)) {
      limitByUser.set(s.user_id, s.monthly_limit_usd);
    }
  }

  const signals: Signal[] = [];
  for (const rec of daily) {
    const limit = limitByUser.get(rec.user_id);
    if (!limit) continue;
    if (rec.used_usd === null) continue;

    const threshold = limit.mul(0.2);
    if (rec.used_usd.gt(threshold)) {
      const dateStr = formatDate(rec.usage_date);
      signals.push({
        id: signalId('high_spend', rec.user_id, dateStr),
        group: 'high_spend',
        severity: 'warning',
        message: `User ${rec.user_id} spent $${rec.used_usd.toFixed(2)} on ${dateStr}, exceeding 20% of their $${limit.toFixed(2)} monthly limit.`,
        target: { page: 'user-analysis', entityId: rec.user_id },
        read: false,
      });
    }
  }
  return signals;
}

/**
 * Low-balance signals: a user's remaining balance is ≤ 10% of their
 * Monthly_Budget_Limit (Requirement 17.2).
 *
 * Severity: **critical**. Group: **low_balance**.
 * Navigation target: User Analysis page → user entity.
 */
export function detectLowBalance(summaries: readonly MonthlySummaryRecord[]): Signal[] {
  const signals: Signal[] = [];
  for (const s of summaries) {
    if (s.monthly_limit_usd === null || s.monthly_limit_usd.lte(0)) continue;
    if (s.remaining_monthly_limit_usd === null) continue;

    const threshold = s.monthly_limit_usd.mul(0.1);
    if (s.remaining_monthly_limit_usd.lte(threshold)) {
      signals.push({
        id: signalId('low_balance', s.user_id, s.billing_month),
        group: 'low_balance',
        severity: 'critical',
        message: `User ${s.user_id} has only $${s.remaining_monthly_limit_usd.toFixed(2)} remaining (≤10% of $${s.monthly_limit_usd.toFixed(2)} limit).`,
        target: { page: 'user-analysis', entityId: s.user_id },
        read: false,
      });
    }
  }
  return signals;
}

/**
 * API key anomaly signals: a key's single-day request count exceeds 3× its
 * average daily request count (Requirement 17.3).
 *
 * The `keyDailyRequestCounts` map provides the daily request counts for each
 * key. The average is computed over all provided days. Any day exceeding 3×
 * the average triggers a signal.
 *
 * Severity: **warning**. Group: **api_key_anomaly**.
 * Navigation target: Key Analysis page → key entity.
 */
export function detectApiKeyAnomaly(
  keyDailyRequestCounts: ReadonlyMap<string, readonly number[]>,
): Signal[] {
  const signals: Signal[] = [];
  for (const [keyId, dailyCounts] of keyDailyRequestCounts) {
    if (dailyCounts.length === 0) continue;

    const total = dailyCounts.reduce((sum, c) => sum + c, 0);
    const avg = total / dailyCounts.length;
    if (avg <= 0) continue;

    const threshold = avg * 3;
    for (let i = 0; i < dailyCounts.length; i++) {
      const count = dailyCounts[i]!;
      if (count > threshold) {
        signals.push({
          id: signalId('api_key_anomaly', keyId, String(i)),
          group: 'api_key_anomaly',
          severity: 'warning',
          message: `API key ${keyId} made ${count} requests on day ${i + 1}, exceeding 3× its daily average of ${avg.toFixed(1)}.`,
          target: { page: 'key-analysis', entityId: keyId },
          read: false,
        });
      }
    }
  }
  return signals;
}

/**
 * Response-time anomaly signals: a user's avg_duration_ms exceeds 60 000 ms
 * (Requirement 17.4).
 *
 * Severity: **informational**. Group: **response_time_anomaly**.
 * Navigation target: User Analysis page → user entity.
 */
export function detectResponseTimeAnomaly(
  summaries: readonly MonthlySummaryRecord[],
): Signal[] {
  const THRESHOLD_MS = 60_000;
  const signals: Signal[] = [];
  for (const s of summaries) {
    if (s.avg_duration_ms === null) continue;
    if (s.avg_duration_ms > THRESHOLD_MS) {
      signals.push({
        id: signalId('response_time_anomaly', s.user_id, s.billing_month),
        group: 'response_time_anomaly',
        severity: 'informational',
        message: `User ${s.user_id} has an average response time of ${s.avg_duration_ms.toFixed(0)}ms, exceeding the 60000ms threshold.`,
        target: { page: 'user-analysis', entityId: s.user_id },
        read: false,
      });
    }
  }
  return signals;
}

/**
 * Risk hint signals: a user triggers high-spend alerts on ≥ 2 consecutive
 * days within the selected Billing_Month (Requirement 17.5).
 *
 * Severity: **critical**. Group: **risk_hint**.
 * Navigation target: User Analysis page → user entity.
 *
 * The function identifies sequences of consecutive high-spend days per user
 * and emits a single risk hint per qualifying sequence.
 */
export function detectRiskHint(
  daily: readonly DailyUsageRecord[],
  summaries: readonly MonthlySummaryRecord[],
): Signal[] {
  // Build a lookup of per-user monthly budget limit.
  const limitByUser = new Map<string, Decimal>();
  for (const s of summaries) {
    if (s.monthly_limit_usd !== null && s.monthly_limit_usd.gt(0)) {
      limitByUser.set(s.user_id, s.monthly_limit_usd);
    }
  }

  // Group daily records by user_id, then sort by date within each user.
  const dailyByUser = new Map<string, DailyUsageRecord[]>();
  for (const rec of daily) {
    const existing = dailyByUser.get(rec.user_id);
    if (existing) {
      existing.push(rec);
    } else {
      dailyByUser.set(rec.user_id, [rec]);
    }
  }

  const signals: Signal[] = [];

  for (const [userId, records] of dailyByUser) {
    const limit = limitByUser.get(userId);
    if (!limit) continue;

    const threshold = limit.mul(0.2);

    // Sort records by usage_date ascending.
    const sorted = [...records].sort(
      (a, b) => a.usage_date.getTime() - b.usage_date.getTime(),
    );

    // Find consecutive runs of high-spend days.
    let consecutiveCount = 0;
    let runStart: Date | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const rec = sorted[i]!;
      const isHighSpend =
        rec.used_usd !== null && rec.used_usd.gt(threshold);

      if (isHighSpend) {
        if (consecutiveCount === 0) {
          runStart = rec.usage_date;
        }
        // Check if this day is consecutive to the previous high-spend day.
        if (consecutiveCount > 0) {
          const prevDate = sorted[i - 1]!.usage_date;
          const diffMs = rec.usage_date.getTime() - prevDate.getTime();
          const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
          if (diffDays === 1) {
            consecutiveCount++;
          } else {
            // Not consecutive: emit the run if qualifying, then restart.
            if (consecutiveCount >= 2) {
              signals.push({
                id: signalId('risk_hint', userId, formatDate(runStart!)),
                group: 'risk_hint',
                severity: 'critical',
                message: `User ${userId} triggered high-spend alerts on ${consecutiveCount} consecutive days starting ${formatDate(runStart!)}.`,
                target: { page: 'user-analysis', entityId: userId },
                read: false,
              });
            }
            consecutiveCount = 1;
            runStart = rec.usage_date;
          }
        } else {
          consecutiveCount = 1;
        }
      } else {
        // Not a high-spend day: emit the run if qualifying, then reset.
        if (consecutiveCount >= 2) {
          signals.push({
            id: signalId('risk_hint', userId, formatDate(runStart!)),
            group: 'risk_hint',
            severity: 'critical',
            message: `User ${userId} triggered high-spend alerts on ${consecutiveCount} consecutive days starting ${formatDate(runStart!)}.`,
            target: { page: 'user-analysis', entityId: userId },
            read: false,
          });
        }
        consecutiveCount = 0;
        runStart = null;
      }
    }

    // End of records: emit final run if qualifying.
    if (consecutiveCount >= 2) {
      signals.push({
        id: signalId('risk_hint', userId, formatDate(runStart!)),
        group: 'risk_hint',
        severity: 'critical',
        message: `User ${userId} triggered high-spend alerts on ${consecutiveCount} consecutive days starting ${formatDate(runStart!)}.`,
        target: { page: 'user-analysis', entityId: userId },
        read: false,
      });
    }
  }

  return signals;
}

// ─── Unread Badge Count ─────────────────────────────────────────────────────

/**
 * Compute the number of unread signals in a signal list (Requirement 16.3).
 *
 * This is a pure function used by the UI to display the unread-count badge on
 * the Bell icon. Each signal already carries a {@link Signal.target} with
 * `page` and `entityId` for navigation (Requirement 16.5).
 *
 * @param signals - The signal list to count unread entries from.
 * @returns The count of signals where `read === false`.
 */
export function unreadCount(signals: readonly Signal[]): number {
  let count = 0;
  for (const s of signals) {
    if (s.read === false) {
      count++;
    }
  }
  return count;
}

// ─── Composite Detector ─────────────────────────────────────────────────────

/**
 * Detect all signals for a Billing_Month by evaluating every rule against the
 * provided input data (Requirements 16.2, 17.1–17.6).
 *
 * This is the primary entry point for the Signal Engine. It is a pure function:
 * given the same inputs it always produces the same signals.
 *
 * @param input - The detection input containing summaries, daily records, and
 *   per-key daily request counts.
 * @returns All detected signals, combining results from every rule.
 */
export function detectSignals(input: DetectSignalsInput): Signal[] {
  const { summaries, daily, keyDailyRequestCounts } = input;

  return [
    ...detectHighSpend(daily, summaries),
    ...detectLowBalance(summaries),
    ...detectApiKeyAnomaly(keyDailyRequestCounts),
    ...detectResponseTimeAnomaly(summaries),
    ...detectRiskHint(daily, summaries),
  ];
}
