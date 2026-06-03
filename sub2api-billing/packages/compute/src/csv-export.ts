/**
 * Export Service - buildCsvExport (Requirements 20.1, 20.2, 20.3, 20.5).
 *
 * Produces a downloadable CSV file from the currently filtered page data.
 * This is a pure function: it accepts the page name, billing month, ordered
 * column list, and rows, and returns the filename and CSV content.
 *
 * - The header row equals the ordered column list (Req 20.2).
 * - Rows are serialized using the shared CSV serializer (Req 20.1).
 * - The filename follows the pattern `pageName_billingMonth_timestamp.csv` (Req 20.3).
 * - When rows are empty, the output contains only the header row (Req 20.5).
 */
import { serializeCsv } from './csv-serializer.js';

/**
 * Input for building a CSV export.
 */
export interface CsvExportRequest {
  /** The name of the page being exported (e.g. "dashboard", "user-analysis"). */
  pageName: string;
  /** The selected Billing_Month in YYYY-MM format. */
  billingMonth: string;
  /** Ordered column names that form the header and define serialization order. */
  columns: readonly string[];
  /** The currently filtered rows to export. */
  rows: ReadonlyArray<Record<string, unknown>>;
}

/**
 * Result of building a CSV export.
 */
export interface CsvExportResult {
  /** The generated filename: `pageName_billingMonth_timestamp.csv`. */
  filename: string;
  /** The full CSV content including header row and data rows. */
  content: string;
}

/**
 * Build a CSV export from the given page data.
 *
 * @param request - The export request containing page name, billing month,
 *   column list, and filtered rows.
 * @param now - Optional timestamp override for deterministic testing.
 *   Defaults to `Date.now()`.
 * @returns The filename and CSV content.
 */
export function buildCsvExport(
  request: CsvExportRequest,
  now: number = Date.now(),
): CsvExportResult {
  const { pageName, billingMonth, columns, rows } = request;

  // Generate the filename: pageName_billingMonth_timestamp.csv
  const filename = `${pageName}_${billingMonth}_${now}.csv`;

  // Serialize using the shared CSV serializer (handles RFC 4180 quoting,
  // header-only when rows is empty per Req 20.5).
  const content = serializeCsv(rows as ReadonlyArray<Record<string, unknown>>, columns);

  return { filename, content };
}
