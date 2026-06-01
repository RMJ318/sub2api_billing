/**
 * Ingestion configuration, summary, result, and structured log types
 * (design "Ingestion Service" and "Ingestion Log and Engine Models").
 *
 * The ingestion log is a discriminated union so each outcome can be surfaced
 * in an operator view and asserted in tests. Counts in `IngestionSummary`
 * satisfy Requirement 1.7.
 */
import type { ParseFailure } from './parsing.js';

/** Inputs that drive an ingestion run. */
export interface IngestionConfig {
  billingRootDir: string;
  /** Bounded streaming batch for `request_detail` (default 10_000 rows). */
  requestDetailBatchSize: number;
}

/** End-of-run counts recorded for every ingestion (Requirement 1.7). */
export interface IngestionSummary {
  foldersProcessed: number;
  filesProcessed: number;
  recordsLoaded: number;
  rowsRejected: number;
}

/**
 * One structured entry in the ingestion log. The `type` discriminant selects
 * the relevant fields for each ingestion outcome.
 */
export type IngestionLogEntry =
  | { type: 'skipped_folder'; folder: string }
  | { type: 'missing_file'; folder: string; file: string }
  | { type: 'access_error'; path: string; detail: string }
  | { type: 'rejected_row'; file: string; rowNumber: number; failures: ParseFailure[] }
  | { type: 'reconciliation'; userId: string; month: string; dailySum: string; monthly: string }
  | { type: 'unmatched_reference'; requestId: string; apiKeyId: string; month: string }
  | { type: 'summary'; summary: IngestionSummary };

/** The outcome of a complete ingestion run. */
export interface IngestionResult {
  summary: IngestionSummary;
  log: IngestionLogEntry[];
}
