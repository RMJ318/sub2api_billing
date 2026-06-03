/**
 * Streaming loader for `request_detail.csv` (Requirement 3.1, design task 15.5).
 *
 * Reads the file using a streaming reader (`csv-parse` streaming interface) that
 * processes the file in bounded-size increments so peak memory consumption for
 * the file does not increase proportionally with the total number of rows.
 *
 * The loader:
 *  1. Opens a read stream on the CSV file.
 *  2. Pipes it through `csv-parse` in streaming/event-driven mode (RFC 4180).
 *  3. Collects parsed raw row arrays into batches of `requestDetailBatchSize`.
 *  4. For each batch, parses rows through the compute row parser and inserts
 *     valid records into DuckDB via the store's `insertRequestDetailRecords`.
 *  5. Rejected rows are accumulated for the ingestion log.
 *
 * Because only one batch of raw rows is held in memory at a time (plus the
 * current DuckDB appender buffer), peak memory is bounded by the batch size
 * and is independent of the total file row count.
 */
import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import type { DuckDBConnection } from '@duckdb/node-api';
import { parseRow, requestDetailSchema } from '@core/compute';
import { fillBillingMonthFromFolder } from './folder-scanner.js';
import { insertRequestDetailRecords } from '@core/store';
import type { RequestDetailRecord, IngestionLogEntry } from '@core/compute';

/** Default batch size when none is configured (design: 10_000). */
export const DEFAULT_REQUEST_DETAIL_BATCH_SIZE = 10_000;

/** Options for the streaming loader. */
export interface StreamingLoaderOptions {
  /** Path to the `request_detail.csv` file on disk. */
  filePath: string;
  /** The `YYYY-MM` folder name this file belongs to (for Billing_Month fallback). */
  folderName: string;
  /** An open DuckDB connection with the `request_detail` schema created. */
  connection: DuckDBConnection;
  /** Number of rows to accumulate before flushing a batch to DuckDB. */
  batchSize?: number;
}

/** Result of a streaming load run. */
export interface StreamingLoaderResult {
  /** Number of records successfully inserted into DuckDB. */
  recordsLoaded: number;
  /** Number of rows rejected due to parse/validation failures. */
  rowsRejected: number;
  /** Ingestion log entries for rejected rows. */
  log: IngestionLogEntry[];
}

/**
 * Stream `request_detail.csv` in bounded batches and insert into DuckDB.
 *
 * Peak memory is independent of file row count because:
 *  - The file is read as a Node.js stream (not `fs.readFileSync`).
 *  - `csv-parse` emits rows one at a time; we buffer at most `batchSize` rows.
 *  - Each batch is parsed, inserted, and then released before the next batch.
 *
 * @param options - Streaming loader configuration.
 * @returns Summary counts and any ingestion log entries for rejected rows.
 */
export async function streamRequestDetail(
  options: StreamingLoaderOptions,
): Promise<StreamingLoaderResult> {
  const batchSize = options.batchSize ?? DEFAULT_REQUEST_DETAIL_BATCH_SIZE;
  const { filePath, folderName, connection } = options;

  let header: string[] | null = null;
  let batch: string[][] = [];
  let batchStartRow = 1; // 1-based data row number (header excluded)
  let recordsLoaded = 0;
  let rowsRejected = 0;
  const log: IngestionLogEntry[] = [];

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const parser = fileStream.pipe(parse({
    bom: true,
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }));

  for await (const row of parser) {
    const rawRow = row as string[];

    // First row is the header (Req 2.1).
    if (header === null) {
      header = rawRow;
      continue;
    }

    batch.push(rawRow);

    // Flush when we reach the batch size.
    if (batch.length >= batchSize) {
      const result = await flushBatch(
        batch,
        header,
        batchStartRow,
        folderName,
        connection,
        filePath,
      );
      recordsLoaded += result.recordsLoaded;
      rowsRejected += result.rowsRejected;
      log.push(...result.log);
      batchStartRow += batch.length;
      batch = [];
    }
  }

  // Flush any remaining rows in the final partial batch.
  if (batch.length > 0 && header !== null) {
    const result = await flushBatch(
      batch,
      header,
      batchStartRow,
      folderName,
      connection,
      filePath,
    );
    recordsLoaded += result.recordsLoaded;
    rowsRejected += result.rowsRejected;
    log.push(...result.log);
  }

  return { recordsLoaded, rowsRejected, log };
}

/**
 * Parse and insert one batch of raw rows. Returns counts and log entries for
 * any rejected rows.
 */
async function flushBatch(
  rawRows: string[][],
  header: string[],
  startRowNumber: number,
  folderName: string,
  connection: DuckDBConnection,
  filePath: string,
): Promise<StreamingLoaderResult> {
  const records: RequestDetailRecord[] = [];
  const log: IngestionLogEntry[] = [];
  let rowsRejected = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = startRowNumber + i;
    const result = parseRow<RequestDetailRecord>(
      rawRows[i]!,
      header,
      requestDetailSchema,
      rowNumber,
    );

    if (result.record !== undefined) {
      // Apply Billing_Month fallback from folder name (Req 1.3).
      // The parser may produce `null` for an empty optional `billing_month`
      // (the field is not marked required in the schema), so coerce to empty
      // string before the fallback logic.
      const record = result.record;
      if (record.billing_month == null) {
        (record as { billing_month: string }).billing_month = '';
      }
      const filled = fillBillingMonthFromFolder(record, folderName);
      records.push(filled);
    } else {
      rowsRejected++;
      log.push({
        type: 'rejected_row',
        file: filePath,
        rowNumber,
        failures: result.failures,
      });
    }
  }

  // Insert the batch into DuckDB.
  if (records.length > 0) {
    await insertRequestDetailRecords(connection, records);
  }

  return { recordsLoaded: records.length, rowsRejected, log };
}
