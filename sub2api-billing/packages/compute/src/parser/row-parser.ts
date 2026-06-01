/**
 * CSV row parser and validator (Requirements 2.1, 2.2, 2.9, 2.10, 2.11).
 *
 * This is a pure module that turns CSV text into normalized records following
 * the design's "CSV Parser and Normalizer" pipeline:
 *
 *  1. Treat row 0 as the header and map columns by header name (Req 2.1).
 *  2. Split fields using RFC 4180 quoting via `csv-parse` (Req 2.2).
 *  3. Trim every value; whitespace-only becomes empty (Req 2.7) — the field
 *     codecs perform this trimming.
 *  4. Apply the per-column codec; non-required empties become `null` (Req 2.8).
 *  5. Enforce required fields per record type (Req 2.10).
 *  6. On ANY failure (bad conversion or empty required field), STILL evaluate
 *     all remaining fields, then reject the row recording every failing field
 *     name with its raw value (Req 2.9). Otherwise emit a normalized record
 *     exposing all documented fields under their documented names (Req 2.11).
 *
 * The parser does no I/O: callers pass CSV text (a whole small file, or a
 * batch of lines for the streamed `request_detail`). Required-field handling
 * uses each schema's `required` flags, so the same engine serves all five
 * record types.
 */
import { parse } from 'csv-parse/sync';
import type { CodecResult, ParseFailure, RowResult } from '../types/parsing.js';
import { text } from '../codecs/field-codecs.js';
import type { ColumnSchema, RecordSchema } from './schemas.js';

/** Outcome of parsing a whole CSV document for one record type. */
export interface ParseFileResult<T> {
  /** Accepted, normalized records in source order (Req 2.11). */
  records: T[];
  /** All row outcomes (accepted and rejected) in source order, for logging. */
  rows: RowResult<T>[];
  /** The header names as they appeared in the file's first row (Req 2.1). */
  header: string[];
}

/**
 * The `text` codec is used for the value-presence check: a value is "empty"
 * exactly when the `text` codec maps it to `null` (trim + whitespace-only ->
 * null, Req 2.7/2.8). Centralizing this keeps required-field emptiness and
 * optional-field nulling consistent.
 */
function isEmptyValue(raw: string): boolean {
  const result = text.parse(raw);
  return result.ok && result.value === null;
}

/**
 * Parse a single already-split row (array of raw cell strings) against a
 * schema, mapping by header index. Evaluates EVERY column even after a failure
 * is seen (Req 2.9) so the returned failure list is complete.
 *
 * @param rawValues - Raw cell strings for the row, indexed to match `header`.
 * @param header - Header names from the file's first row.
 * @param schema - The record schema (column codecs + required flags).
 * @param rowNumber - 1-based data row number (excludes the header row).
 */
export function parseRow<T>(
  rawValues: string[],
  header: string[],
  schema: RecordSchema<T>,
  rowNumber: number,
): RowResult<T> {
  const failures: ParseFailure[] = [];
  const record: Record<string, unknown> = {};

  // Index header names so columns are mapped by name, not position (Req 2.1).
  const indexByName = new Map<string, number>();
  header.forEach((name, index) => {
    if (!indexByName.has(name)) {
      indexByName.set(name, index);
    }
  });

  for (const column of schema.columns) {
    const rawValue = rawAt(rawValues, indexByName, column.field);

    if (isEmptyValue(rawValue)) {
      if (column.required) {
        // Empty required field -> failure, but keep evaluating (Req 2.9, 2.10).
        failures.push({
          field: column.field,
          rawValue,
          reason: 'Required field is empty',
        });
      } else {
        // Empty non-required field -> null (Req 2.8).
        record[column.field] = null;
      }
      continue;
    }

    const result: CodecResult<unknown> = column.codec.parse(rawValue);
    if (result.ok) {
      record[column.field] = result.value;
    } else {
      // Bad conversion -> failure, but keep evaluating remaining fields (Req 2.9).
      failures.push({ field: column.field, rawValue, reason: result.reason });
    }
  }

  if (failures.length > 0) {
    return { failures, rowNumber };
  }
  return { record: record as T, failures: [], rowNumber };
}

/** Look up a column's raw value by header name; missing columns read as empty. */
function rawAt(
  rawValues: string[],
  indexByName: Map<string, number>,
  field: string,
): string {
  const index = indexByName.get(field);
  if (index === undefined) {
    return '';
  }
  const value = rawValues[index];
  return value === undefined ? '' : value;
}

/**
 * Parse a complete CSV document (header + data rows) for one record type.
 *
 * Uses `csv-parse` for RFC 4180 splitting (Req 2.2) with `info` enabled so each
 * rejected row reports the source line number. The first parsed row is the
 * header (Req 2.1); blank lines are skipped and short/long rows are tolerated
 * (missing trailing columns read as empty and are validated normally).
 *
 * @param csvText - The full CSV text for one source file.
 * @param schema - The record schema for that file type.
 */
export function parseCsv<T>(csvText: string, schema: RecordSchema<T>): ParseFileResult<T> {
  const parsed = parse(csvText, {
    bom: true,
    columns: false,
    info: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as unknown as Array<{ record: string[]; info: { lines: number; records: number } }>;

  if (parsed.length === 0) {
    return { records: [], rows: [], header: [] };
  }

  const header = parsed[0]!.record;
  const records: T[] = [];
  const rows: RowResult<T>[] = [];

  // `info.records` counts the header as record 1, so data rows start at 2;
  // subtract 1 to produce a 1-based data row number (header excluded).
  for (let i = 1; i < parsed.length; i++) {
    const entry = parsed[i]!;
    const rowNumber = entry.info.records - 1;
    const result = parseRow(entry.record, header, schema, rowNumber);
    rows.push(result);
    if (result.record !== undefined) {
      records.push(result.record);
    }
  }

  return { records, rows, header };
}
