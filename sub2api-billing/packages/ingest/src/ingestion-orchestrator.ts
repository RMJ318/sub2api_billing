/**
 * Ingestion orchestration over discovered billing folders (Requirements 1.2,
 * 1.4, 1.5, 1.6, 1.7, 21.2, 21.3).
 *
 * Scans the configured billing root directory non-recursively for YYYY-MM
 * billing month folders, reads the five expected CSV files via the parser,
 * fills `billing_month` from the folder name when empty, records structured log
 * entries for each ingestion outcome, runs reconciliation and
 * unmatched-reference detection, and produces a final {@link IngestionSummary}.
 *
 * This is the side-effecting orchestration layer: it performs filesystem I/O
 * (readdir, stat, readFile) and delegates parsing to the pure compute library.
 * The largest source file, `request_detail.csv`, is routed through the bounded-
 * memory streaming loader so the ingestion path matches Requirement 3.1.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  parseCsv,
  monthlySummarySchema,
  dailyUsageSchema,
  modelUsageSchema,
  keyUsageSchema,
  requestDetailSchema,
  reconcileDailyToMonthly,
  detectUnmatchedReferences,
} from '@core/compute';
import type {
  IngestionConfig,
  IngestionLogEntry,
  IngestionResult,
  IngestionSummary,
  MonthlySummaryRecord,
  DailyUsageRecord,
  ModelUsageRecord,
  KeyUsageRecord,
  RequestDetailRecord,
} from '@core/compute';
import type { RecordSchema } from '@core/compute';
import { InMemoryRecordStore } from '@core/store';

import { isValidBillingMonthFolder, fillBillingMonthFromFolder } from './folder-scanner.js';
import { streamRequestDetail } from './streaming-loader.js';

/**
 * The five expected CSV files within a billing month folder (Requirement 1.2).
 * Order is stable for log determinism but does not affect correctness.
 */
export const EXPECTED_FILES = [
  'monthly_user_summary.csv',
  'daily_user_usage.csv',
  'model_user_usage.csv',
  'api_key_usage.csv',
  'request_detail.csv',
] as const;

/**
 * Maps each expected file name to its corresponding record schema so the parser
 * knows which codecs and required fields to apply.
 */
const FILE_SCHEMA_MAP: Record<string, RecordSchema<unknown>> = {
  'monthly_user_summary.csv': monthlySummarySchema as RecordSchema<unknown>,
  'daily_user_usage.csv': dailyUsageSchema as RecordSchema<unknown>,
  'model_user_usage.csv': modelUsageSchema as RecordSchema<unknown>,
  'api_key_usage.csv': keyUsageSchema as RecordSchema<unknown>,
  'request_detail.csv': requestDetailSchema as RecordSchema<unknown>,
};

/**
 * Result of ingesting a single folder, used internally to accumulate records
 * before loading them into the store.
 */
interface FolderIngestionResult {
  monthlySummaries: MonthlySummaryRecord[];
  dailyUsage: DailyUsageRecord[];
  modelUsage: ModelUsageRecord[];
  keyUsage: KeyUsageRecord[];
  requestDetails: RequestDetailRecord[];
  filesProcessed: number;
  recordsLoaded: number;
  rowsRejected: number;
  logEntries: IngestionLogEntry[];
}

/**
 * Run the full ingestion pipeline over the configured billing root directory.
 *
 * Steps:
 *  1. List immediate subfolders of the billing root (Req 1.1); halt on
 *     access error (Req 1.6).
 *  2. Filter to valid YYYY-MM folders.
 *  3. For each folder, determine which of the five expected files are present
 *     (Req 1.2); log skipped-folder (Req 1.4) or missing-file entries
 *     (Req 1.5) as applicable.
 *  4. Parse each present file via the CSV parser and fill `billing_month`
 *     from the folder name when empty (Req 1.3). `request_detail.csv` is
 *     processed through the streaming loader.
 *  5. Collect rejected-row entries in the ingestion log (Req 2.9).
 *  6. Load valid records into the provided store.
 *  7. Run reconciliation (Req 21.2) and unmatched-reference detection
 *     (Req 21.3) across all loaded records.
 *  8. Record the ingestion summary (Req 1.7).
 *
 * @param config - The ingestion configuration (billingRootDir, batch size).
 * @param store - The in-memory record store to load records into.
 * @returns The ingestion result with summary counts and structured log.
 */
export async function runIngestion(
  config: IngestionConfig,
  store: InMemoryRecordStore,
): Promise<IngestionResult> {
  const log: IngestionLogEntry[] = [];
  let foldersProcessed = 0;
  let totalFilesProcessed = 0;
  let totalRecordsLoaded = 0;
  let totalRowsRejected = 0;

  // Accumulated records for reconciliation (needs cross-folder view).
  const allMonthlySummaries: MonthlySummaryRecord[] = [];
  const allDailyUsage: DailyUsageRecord[] = [];
  const allKeyUsage: KeyUsageRecord[] = [];
  const allRequestDetails: RequestDetailRecord[] = [];

  // Step 1: List the billing root directory (non-recursive).
  let entries: string[];
  try {
    const dirEntries = await readdir(config.billingRootDir, { withFileTypes: true });
    entries = dirEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (err: unknown) {
    // Root unreadable -> access-error + halt (Requirement 1.6).
    const detail = err instanceof Error ? err.message : String(err);
    log.push({ type: 'access_error', path: config.billingRootDir, detail });
    const summary: IngestionSummary = {
      foldersProcessed: 0,
      filesProcessed: 0,
      recordsLoaded: 0,
      rowsRejected: 0,
    };
    log.push({ type: 'summary', summary });
    return { summary, log };
  }

  // Step 2: Filter to valid YYYY-MM folders.
  const billingFolders = entries
    .filter(isValidBillingMonthFolder)
    .sort(); // ascending chronological order (YYYY-MM is lex-sortable)

  // Step 3-5: Process each billing folder.
  for (const folderName of billingFolders) {
    const folderPath = join(config.billingRootDir, folderName);
    const folderResult = await processFolder(folderPath, folderName, log);

    if (folderResult === null) {
      // Skipped folder — already logged inside processFolder.
      continue;
    }

    foldersProcessed++;
    totalFilesProcessed += folderResult.filesProcessed;
    totalRecordsLoaded += folderResult.recordsLoaded;
    totalRowsRejected += folderResult.rowsRejected;
    log.push(...folderResult.logEntries);

    // Accumulate for reconciliation.
    allMonthlySummaries.push(...folderResult.monthlySummaries);
    allDailyUsage.push(...folderResult.dailyUsage);
    allKeyUsage.push(...folderResult.keyUsage);
    allRequestDetails.push(...folderResult.requestDetails);

    // Step 6: Load into store.
    store.load({
      monthlySummaries: folderResult.monthlySummaries,
      dailyUsage: folderResult.dailyUsage,
      modelUsage: folderResult.modelUsage,
      keyUsage: folderResult.keyUsage,
    });
  }

  // Step 7: Reconciliation (Req 21.2) and unmatched-reference detection (Req 21.3).
  const reconResult = reconcileDailyToMonthly(allDailyUsage, allMonthlySummaries);
  log.push(...reconResult.logEntries);

  const unmatchedResult = detectUnmatchedReferences(allRequestDetails, allKeyUsage);
  log.push(...unmatchedResult.logEntries);

  // Step 8: Final ingestion summary (Req 1.7).
  const summary: IngestionSummary = {
    foldersProcessed,
    filesProcessed: totalFilesProcessed,
    recordsLoaded: totalRecordsLoaded,
    rowsRejected: totalRowsRejected,
  };
  log.push({ type: 'summary', summary });

  return { summary, log };
}

/**
 * Process a single billing month folder: determine which expected files are
 * present, log skipped/missing entries, and parse each present file.
 *
 * @returns `null` if the folder is skipped (none of the 5 expected files),
 *   otherwise a result with accumulated records and log entries.
 */
async function processFolder(
  folderPath: string,
  folderName: string,
  parentLog: IngestionLogEntry[],
): Promise<FolderIngestionResult | null> {
  // Determine which of the five expected files exist in this folder.
  const presentFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const fileName of EXPECTED_FILES) {
    const filePath = join(folderPath, fileName);
    try {
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        presentFiles.push(fileName);
      } else {
        missingFiles.push(fileName);
      }
    } catch {
      missingFiles.push(fileName);
    }
  }

  // Skipped folder: none of the five expected files are present (Req 1.4).
  if (presentFiles.length === 0) {
    parentLog.push({ type: 'skipped_folder', folder: folderName });
    return null;
  }

  // Missing files: some but not all present (Req 1.5).
  const logEntries: IngestionLogEntry[] = [];
  if (missingFiles.length > 0) {
    for (const missingFile of missingFiles) {
      logEntries.push({ type: 'missing_file', folder: folderName, file: missingFile });
    }
  }

  // Parse each present file.
  const monthlySummaries: MonthlySummaryRecord[] = [];
  const dailyUsage: DailyUsageRecord[] = [];
  const modelUsage: ModelUsageRecord[] = [];
  const keyUsage: KeyUsageRecord[] = [];
  const requestDetails: RequestDetailRecord[] = [];
  let filesProcessed = 0;
  let recordsLoaded = 0;
  let rowsRejected = 0;

  for (const fileName of presentFiles) {
    const filePath = join(folderPath, fileName);
    if (fileName === 'request_detail.csv') {
      const streamResult = await streamRequestDetail({
        filePath,
        folderName,
        batchSize: config.requestDetailBatchSize,
        collectRecords: true,
      });

      filesProcessed++;
      rowsRejected += streamResult.rowsRejected;
      recordsLoaded += streamResult.recordsLoaded;
      requestDetails.push(...streamResult.records);
      logEntries.push(
        ...streamResult.log.map((entry) =>
          entry.type === 'rejected_row'
            ? { ...entry, file: `${folderName}/${fileName}` }
            : entry,
        ),
      );
      continue;
    }

    let csvText: string;
    try {
      csvText = await readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      // Access error on individual file — log and continue.
      const detail = err instanceof Error ? err.message : String(err);
      logEntries.push({ type: 'access_error', path: filePath, detail });
      continue;
    }

    const schema = FILE_SCHEMA_MAP[fileName]!;
    const parseResult = parseCsv(csvText, schema);
    filesProcessed++;

    // Log rejected rows.
    for (const row of parseResult.rows) {
      if (row.failures.length > 0) {
        rowsRejected++;
        logEntries.push({
          type: 'rejected_row',
          file: `${folderName}/${fileName}`,
          rowNumber: row.rowNumber,
          failures: row.failures,
        });
      }
    }

    // Fill billing_month from folder name for records with empty/null billing_month.
    // The text codec maps empty CSV cells to `null`, so we normalize null to ''
    // before calling the fill helper which checks `.trim().length > 0`.
    const records = parseResult.records.map((r) => {
      const rec = r as { billing_month: string | null };
      if (rec.billing_month === null || rec.billing_month === undefined) {
        rec.billing_month = '';
      }
      return fillBillingMonthFromFolder(rec as { billing_month: string }, folderName);
    });
    recordsLoaded += records.length;

    // Distribute records to the correct collection.
    switch (fileName) {
      case 'monthly_user_summary.csv':
        monthlySummaries.push(...(records as unknown as MonthlySummaryRecord[]));
        break;
      case 'daily_user_usage.csv':
        dailyUsage.push(...(records as unknown as DailyUsageRecord[]));
        break;
      case 'model_user_usage.csv':
        modelUsage.push(...(records as unknown as ModelUsageRecord[]));
        break;
      case 'api_key_usage.csv':
        keyUsage.push(...(records as unknown as KeyUsageRecord[]));
        break;
    }
  }

  return {
    monthlySummaries,
    dailyUsage,
    modelUsage,
    keyUsage,
    requestDetails,
    filesProcessed,
    recordsLoaded,
    rowsRejected,
    logEntries,
  };
}
