/**
 * CSV record serializer (Requirements 2.1, 2.2, 2.11, Property 8).
 *
 * Serializes a normalized record to a single CSV row under a given ordered
 * header, applying RFC 4180 quoting rules (escape commas, double-quotes, and
 * newlines). This is the inverse of the row parser and is reusable by both
 * the parser round-trip tests and the Export Service.
 *
 * Type serialization rules:
 * - `Decimal` → its `.toString()` representation (preserves fractional digits).
 * - `Date` → ISO 8601 string with UTC offset (`.toISOString()`).
 * - `boolean` → `"true"` / `"false"`.
 * - `null` / `undefined` → empty string (empty field in CSV, Req 2.8).
 * - `number` → standard numeric string.
 * - `string` → as-is (quoted if it contains special characters).
 *
 * This module is pure — no I/O, no side effects, deterministic output.
 */
import { Decimal } from 'decimal.js';

/**
 * Serialize a single value to its CSV cell string representation.
 * The returned string is NOT yet RFC-4180-quoted; quoting is applied afterwards.
 */
function serializeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Decimal) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  // string or other — coerce to string
  return String(value);
}

/**
 * RFC 4180 quoting: a field MUST be enclosed in double-quotes if it contains
 * a comma, a double-quote, or a line break (CR or LF). Embedded double-quotes
 * are escaped by doubling them (`""` inside the quoted field).
 */
function quoteField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

/**
 * Serialize a normalized record to a CSV row string under a given ordered header.
 *
 * @param record - A normalized record (any of the five record types or a
 *   generic `Record<string, unknown>`). Fields are accessed by the header names.
 * @param header - Ordered array of field/column names that defines the output
 *   column order and which fields to include.
 * @returns A single CSV row string (no trailing newline). Each field is
 *   RFC 4180-quoted if it contains commas, double-quotes, or newlines.
 */
export function serializeCsvRow(
  record: Record<string, unknown>,
  header: readonly string[],
): string {
  return header.map((col) => quoteField(serializeValue(record[col]))).join(',');
}

/**
 * Serialize multiple records to CSV text including the header row.
 *
 * @param records - Array of normalized records.
 * @param header - Ordered array of column names (also written as the first row).
 * @returns Complete CSV text with header + data rows, lines separated by `\r\n`
 *   (RFC 4180 line ending). Empty `records` produces header-only output (Req 20.5).
 */
export function serializeCsv(
  records: ReadonlyArray<Record<string, unknown>>,
  header: readonly string[],
): string {
  const headerRow = header.map(quoteField).join(',');
  if (records.length === 0) {
    return headerRow + '\r\n';
  }
  const dataRows = records.map((r) => serializeCsvRow(r, header));
  return headerRow + '\r\n' + dataRows.join('\r\n') + '\r\n';
}
