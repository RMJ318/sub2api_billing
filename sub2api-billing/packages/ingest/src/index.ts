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
