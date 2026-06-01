import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import { forecastMonthEnd } from './index.js';
import { isInsufficientData } from './index.js';
import type { DailyUsageRecord } from './index.js';

/**
 * Example unit tests for `forecastMonthEnd` (Requirements 14.2, 14.3, 14.4, 14.5).
 *
 * These pin down the worked run-rate math, the days-to-budget division, the
 * over-budget threshold, and the < 3-distinct-days insufficient-data gate on
 * concrete inputs. The universal extrapolation invariant is covered separately
 * by Property 29 (task 8.6).
 */

/** Build a Daily_Usage_Record for the given UTC day with a given Spend. */
function dailyRecord(usageDate: Date, usedUsd: Decimal | null): DailyUsageRecord {
  return {
    billing_month: '2026-04',
    usage_date: usageDate,
    user_id: 'u1',
    email: null,
    username: null,
    request_count: null,
    used_usd: usedUsd,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
  };
}

function dayOf(month: string, day: number): Date {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, day));
}

describe('forecastMonthEnd', () => {
  it('returns InsufficientData below 3 distinct days (Req 14.5)', () => {
    // Two distinct days, even with several records, is insufficient.
    const daily = [
      dailyRecord(dayOf('2026-04', 1), new Decimal('10')),
      dailyRecord(dayOf('2026-04', 1), new Decimal('5')),
      dailyRecord(dayOf('2026-04', 2), new Decimal('10')),
    ];
    const result = forecastMonthEnd(daily, '2026-04', new Decimal('1000'));
    expect(isInsufficientData(result)).toBe(true);
  });

  it('projects the daily run rate across the whole month (Req 14.2)', () => {
    // 3 distinct days in a 30-day April, $10/day => cumulative $30, avg $10/day,
    // projection = 30 + 10 * (30 - 3) = 300.
    const daily = [
      dailyRecord(dayOf('2026-04', 1), new Decimal('10')),
      dailyRecord(dayOf('2026-04', 2), new Decimal('10')),
      dailyRecord(dayOf('2026-04', 3), new Decimal('10')),
    ];
    const result = forecastMonthEnd(daily, '2026-04', new Decimal('1000'));
    expect(isInsufficientData(result)).toBe(false);
    if (isInsufficientData(result)) return;
    expect(result.projectedMonthEndSpendUsd.toString()).toBe('300');
  });

  it('computes days-to-budget as remaining budget / daily rate (Req 14.3)', () => {
    // cumulative $30, avg $10/day, budget $100 => (100 - 30) / 10 = 7 days.
    const daily = [
      dailyRecord(dayOf('2026-04', 1), new Decimal('10')),
      dailyRecord(dayOf('2026-04', 2), new Decimal('10')),
      dailyRecord(dayOf('2026-04', 3), new Decimal('10')),
    ];
    const result = forecastMonthEnd(daily, '2026-04', new Decimal('100'));
    if (isInsufficientData(result)) throw new Error('expected a forecast');
    expect(result.projectedDaysToBudget).toBe(7);
  });

  it('flags over-budget exactly when the projection exceeds the budget (Req 14.4)', () => {
    const daily = [
      dailyRecord(dayOf('2026-04', 1), new Decimal('10')),
      dailyRecord(dayOf('2026-04', 2), new Decimal('10')),
      dailyRecord(dayOf('2026-04', 3), new Decimal('10')),
    ];
    // Projection is 300. Budget 250 -> over; budget 300 -> not over (not strict).
    const over = forecastMonthEnd(daily, '2026-04', new Decimal('250'));
    const exact = forecastMonthEnd(daily, '2026-04', new Decimal('300'));
    if (isInsufficientData(over) || isInsufficientData(exact)) throw new Error('expected forecasts');
    expect(over.overBudget).toBe(true);
    expect(exact.overBudget).toBe(false);
  });

  it('reports Infinity days-to-budget when no Spend has been observed', () => {
    const daily = [
      dailyRecord(dayOf('2026-04', 1), new Decimal('0')),
      dailyRecord(dayOf('2026-04', 2), null),
      dailyRecord(dayOf('2026-04', 3), new Decimal('0')),
    ];
    const result = forecastMonthEnd(daily, '2026-04', new Decimal('100'));
    if (isInsufficientData(result)) throw new Error('expected a forecast');
    expect(result.projectedDaysToBudget).toBe(Infinity);
    expect(result.projectedMonthEndSpendUsd.toString()).toBe('0');
    expect(result.overBudget).toBe(false);
  });

  it('uses the calendar length of the month, including February (Req 14.2)', () => {
    // Feb 2024 is a leap year (29 days). 3 days at $3/day => avg $3, cumulative $9,
    // projection = 9 + 3 * (29 - 3) = 9 + 78 = 87.
    const daily = [
      dailyRecord(dayOf('2024-02', 1), new Decimal('3')),
      dailyRecord(dayOf('2024-02', 2), new Decimal('3')),
      dailyRecord(dayOf('2024-02', 3), new Decimal('3')),
    ];
    const result = forecastMonthEnd(daily, '2024-02', new Decimal('1000'));
    if (isInsufficientData(result)) throw new Error('expected a forecast');
    expect(result.projectedMonthEndSpendUsd.toString()).toBe('87');
  });
});
