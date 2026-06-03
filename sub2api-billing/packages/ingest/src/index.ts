/**
 * @core/ingest - filesystem scanning and CSV ingestion.
 *
 * Holds the folder scanner (YYYY-MM matcher), the streaming CSV reader for
 * `request_detail.csv`, the validator, the reconciliation checker, and the
 * ingestion orchestration that produces a structured ingestion log + summary.
 * Side-effecting; verified with example/integration tests.
 *
 * Implemented incrementally by subsequent tasks.
 */
export const INGEST_PACKAGE = '@core/ingest' as const;

// Folder scanner predicates (Requirement 1.1, 1.3): the pure `YYYY-MM` folder
// matcher, the folder -> Billing_Month derivation, and the Billing_Month
// fallback that fills records with an empty `billing_month` from the folder.
export {
  isValidBillingMonthFolder,
  billingMonthFromFolder,
  fillBillingMonthFromFolder,
} from './folder-scanner.js';

// Ingestion orchestration (Requirements 1.2, 1.4, 1.5, 1.6, 1.7, 21.2, 21.3):
// scans a billing root, discovers YYYY-MM folders, reads expected CSV files via
// the parser, records log entries, runs reconciliation and unmatched-reference
// detection, and produces an IngestionSummary.
export { runIngestion, EXPECTED_FILES } from './ingestion-orchestrator.js';

// Streaming loader for `request_detail.csv` (Requirement 3.1, task 15.5):
// reads the file using a streaming reader that processes in bounded batches
// so peak memory is independent of total row count.
export { streamRequestDetail, DEFAULT_REQUEST_DETAIL_BATCH_SIZE } from './streaming-loader.js';
export type {
  StreamingLoaderOptions,
  StreamingLoaderResult,
} from './streaming-loader.js';
