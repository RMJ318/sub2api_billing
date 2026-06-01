/**
 * Month-end cost forecast (design "Aggregation and Compute Library",
 * Requirement 14.2-14.5, Property 29).
 *
 * The Cost Analysis page projects a Billing_Month's final Spend by extrapolating
 * the run rate observed so far, reports how many days remain until the aggregate
 * budget is reached, and flags when the projection lands over budget:
 *
 * - {@link forecastMonthEnd} consumes the month's Daily_Usage_Records and returns
 *   either a {@link ForecastResult} or, when fewer than 3 distinct days of data
 *   exist, the {@link InsufficientData} sentinel (Requirement 14.5).
 *
 * Model (Property 29): let `observedDays` be the number of distinct calendar days
 * present in the records (the same count that gates Requirement 14.5), let
 * `cumulativeSpend` be the decimal sum of their `used_usd`, and let `daysInMonth`
 * be the calendar length of `month`. Then
 *
 *   averageDailySpend     = cumulativeSpend / observedDays
 *   projectedMonthEndSpend = cumulativeSpend + averageDailySpend × (daysInMonth − observedDays)
 *   projectedDaysToBudget  = (budget − cumulativeSpend) / averageDailySpend
 *   overBudget             = projectedMonthEndSpend > budget
 *
 * Note that `projectedMonthEndSpend` reduces to `averageDailySpend × daysInMonth`,
 * i.e. the daily run rate extended across the whole month (Requirement 14.2).
 *
 * Budget parameter: the design's interface sketch lists the arguments as
 * `(daily, month)`, but Requirements 14.3 and 14.4 are defined against the
 * "aggregate Monthly_Budget_Limit", which is the sum of `monthly_limit_usd` over
 * the month's Monthly_Summary_Records and is therefore *not* carried on a
 * Daily_Usage_Record. The aggregate limit is accepted here as `budgetUsd` so the
 * function can actually compute days-to-budget and the over-budget flag; the
 * caller (Cost Analysis query layer / task 25.1) supplies it.
 *
 * Money stays as `decimal.js` `Decimal` throughout to preserve the up-to-6-digit
 * fractional precision in the source data and avoid float drift; the function is
 * pure and deterministic. It is the source of truth for the forecast panel and
 * the target of design Property 29.
 */
import { Decimal } from 'decimal.js';

import type { ForecastResult, InsufficientData } from './types/forecast.js';
import type { DailyUsageRecord } from './types/records.js';

/** Minimum distinct days of daily records required to forecast (Req 14.5). */
const MIN_DISTINCT_DAYS = 3;

/**
 * Project a Billing_Month's month-end Spend, days-to-budget, and over-budget
 * flag from its Daily_Usage_Records (Requirements 14.2, 14.3, 14.4, 14.5;
 * Property 29).
 *
 * The cumulative Spend and the daily run rate are read from the distinct
 * calendar days present in `daily`. With at least {@link MIN_DISTINCT_DAYS}
 * distinct days the function extrapolates the run rate across the remaining days
 * of `month` to project the month-end Spend, divides the remaining budget by the
 * daily rate to estimate days-to-budget, and sets `overBudget` exactly when the
 * projection exceeds `budgetUsd`. With fewer than {@link MIN_DISTINCT_DAYS}
 * distinct days it returns {@link InsufficientData}, which the UI renders as the
 * insufficient-data message with the over-budget indicator suppressed (Req 14.5).
 *
 * Edge cases:
 * - When no Spend has been observed (`averageDailySpend` is `0`) the budget is
 *   never reached at that rate, so `projectedDaysToBudget` is `Infinity`.
 * - When the full month has already elapsed (`observedDays === daysInMonth`)
 *   there are no remaining days, so the projection equals the cumulative Spend.
 *
 * `daily` is expected to already be scoped to `month`; the records are read but
 * not mutated.
 *
 * @param daily - The month's Daily_Usage_Records (one row per user per day).
 * @param month - The selected Billing_Month as `YYYY-MM`, used for its length.
 * @param budgetUsd - The aggregate Monthly_Budget_Limit for the month.
 * @returns A {@link ForecastResult}, or {@link InsufficientData} below 3 distinct days.
 */
export function forecastMonthEnd(
  daily: readonly DailyUsageRecord[],
  month: string,
  budgetUsd: Decimal,
): ForecastResult | InsufficientData {
  // Sum Spend and tally the distinct calendar days in a single pass.
  const distinctDays = new Set<string>();
  let cumulativeSpend = new Decimal(0);
  for (const record of daily) {
    distinctDays.add(dayKey(record.usage_date));
    if (record.used_usd !== null) {
      cumulativeSpend = cumulativeSpend.plus(record.used_usd);
    }
  }

  const observedDays = distinctDays.size;
  if (observedDays < MIN_DISTINCT_DAYS) {
    return { insufficient: true };
  }

  const daysInMonth = daysInBillingMonth(month);
  const remainingDays = daysInMonth - observedDays;

  // Average daily run rate, then extend it across the rest of the month.
  const averageDailySpend = cumulativeSpend.div(observedDays);
  const projectedMonthEndSpendUsd = cumulativeSpend.plus(averageDailySpend.times(remainingDays));

  // Days until the remaining budget is exhausted at the current daily rate.
  const remainingBudget = budgetUsd.minus(cumulativeSpend);
  const projectedDaysToBudget = averageDailySpend.isZero()
    ? Infinity
    : remainingBudget.div(averageDailySpend).toNumber();

  // Over budget exactly when the projection strictly exceeds the limit (Req 14.4).
  const overBudget = projectedMonthEndSpendUsd.greaterThan(budgetUsd);

  return { projectedMonthEndSpendUsd, projectedDaysToBudget, overBudget };
}

/** A stable per-calendar-day key for a timestamp, in UTC, for distinct counting. */
function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

/**
 * The number of calendar days in a `YYYY-MM` Billing_Month.
 *
 * Day 0 of the following (0-indexed) month is the last day of `month`, so its
 * day-of-month is the month's length (e.g. 28/29 for February).
 */
function daysInBillingMonth(month: string): number {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNumber = Number(monthStr); // 1-based (01-12)
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}
