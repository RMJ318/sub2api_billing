/**
 * Cost forecast result types (design "Ingestion Log and Engine Models",
 * Requirement 14).
 *
 * `forecastMonthEnd` returns a `ForecastResult` when there are at least 3
 * distinct days of daily records, otherwise `InsufficientData` (Req 14.5).
 */
import type { Decimal } from 'decimal.js';

/** A computed month-end spend projection. */
export interface ForecastResult {
  projectedMonthEndSpendUsd: Decimal;
  projectedDaysToBudget: number;
  overBudget: boolean;
}

/** Sentinel returned when fewer than 3 days of daily records exist (Req 14.5). */
export interface InsufficientData {
  insufficient: true;
}

/** Type guard distinguishing a forecast from the insufficient-data sentinel. */
export function isInsufficientData(
  value: ForecastResult | InsufficientData,
): value is InsufficientData {
  return (value as InsufficientData).insufficient === true;
}
