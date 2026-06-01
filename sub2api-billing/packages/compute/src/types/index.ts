/**
 * Shared type surface for the AI Usage Analytics platform.
 *
 * Re-exports the normalized record types, parsing contract, model-family
 * enum, ingestion log/summary types, forecast results, signal types, and
 * query/page DTOs so other packages (`@core/ingest`, `@core/store`,
 * `@app/api`) import them from a single place.
 */
export type {
  MonthlySummaryRecord,
  DailyUsageRecord,
  ModelUsageRecord,
  KeyUsageRecord,
  RequestDetailRecord,
} from './records.js';

export type { ParseFailure, RowResult, CodecResult, FieldCodec } from './parsing.js';

export type { ModelFamily } from './model-family.js';
export { MODEL_FAMILIES } from './model-family.js';

export type {
  IngestionConfig,
  IngestionSummary,
  IngestionLogEntry,
  IngestionResult,
} from './ingestion.js';

export type { ForecastResult, InsufficientData } from './forecast.js';
export { isInsufficientData } from './forecast.js';

export type { Severity, SignalGroup, SignalTarget, Signal } from './signals.js';

export type {
  DateRange,
  RequestDetailSortBy,
  SortDir,
  RequestDetailQuery,
  RequestDetailPage,
} from './query.js';
