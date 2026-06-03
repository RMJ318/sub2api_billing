/**
 * Property 43: CSV export round-trips the filtered rows under the displayed header.
 *
 * For any set of rows and ordered column list, the exported CSV begins with a
 * header row equal to the column list and parsing the export recovers the
 * original row values in order; when the row set is empty the export contains
 * only the header row.
 *
 * **Validates: Requirements 20.1, 20.2, 20.5**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildCsvExport } from './csv-export.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split a single CSV row string into fields, respecting RFC 4180 quoting.
 */
function splitCsvRow(row: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i < row.length) {
    if (row[i] === '"') {
      // Quoted field
      let value = '';
      i++; // skip opening quote
      while (i < row.length) {
        if (row[i] === '"') {
          if (i + 1 < row.length && row[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += row[i];
          i++;
        }
      }
      fields.push(value);
      // Skip comma separator or we're done
      if (i < row.length && row[i] === ',') {
        i++;
        // If comma is at end of row, there's a trailing empty field
        if (i === row.length) {
          fields.push('');
        }
      }
    } else {
      const commaIdx = row.indexOf(',', i);
      if (commaIdx === -1) {
        fields.push(row.slice(i));
        break;
      } else {
        fields.push(row.slice(i, commaIdx));
        i = commaIdx + 1;
        // If comma is at end of row, there's a trailing empty field
        if (i === row.length) {
          fields.push('');
        }
      }
    }
  }

  // Handle empty row
  if (row.length === 0) {
    fields.push('');
  }

  return fields;
}

/**
 * Parse a full CSV content string into a header array and row arrays.
 * Uses \r\n line ending per RFC 4180. Handles embedded newlines inside
 * quoted fields by tracking quote state (including escaped quotes "").
 */
function parseCsvContent(content: string): { header: string[]; rows: string[][] } {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          // Escaped quote inside quoted field
          current += '""';
          i++;
        } else {
          // Closing quote
          current += ch;
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        current += ch;
        inQuotes = true;
      } else if (ch === '\r' && i + 1 < content.length && content[i + 1] === '\n') {
        lines.push(current);
        current = '';
        i++; // skip \n
      } else {
        current += ch;
      }
    }
  }
  // If there's remaining content (no trailing \r\n), push it
  if (current.length > 0) {
    lines.push(current);
  }

  if (lines.length === 0) {
    return { header: [], rows: [] };
  }

  const header = splitCsvRow(lines[0]);
  const rows = lines.slice(1).map(splitCsvRow);
  return { header, rows };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate a column name: a non-empty string consisting of safe identifier-like
 * characters (letters, digits, underscores). Column names should not contain
 * problematic characters since they represent field keys.
 */
function arbColumnName(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/);
}

/**
 * Generate a unique set of column names (1–10 columns).
 */
function arbColumns(): fc.Arbitrary<string[]> {
  return fc
    .uniqueArray(arbColumnName(), { minLength: 1, maxLength: 10 })
    .filter((cols) => cols.length >= 1);
}

/**
 * Generate a cell value: a string that may contain RFC 4180 special characters
 * (commas, double quotes, newlines), null, undefined, numbers, or booleans.
 * We serialize these as strings and verify the round-trip.
 */
function arbCellValue(): fc.Arbitrary<unknown> {
  return fc.oneof(
    // Simple strings (filter out isolated \r which complicates line-level parsing)
    fc.string({ minLength: 0, maxLength: 30 }).filter((s) => !s.includes('\r') || s.includes('\r\n')),
    // Strings with RFC 4180 special characters
    fc.constantFrom(
      'hello, world',
      'say "hi"',
      'line1\nline2',
      'has\r\nnewline',
      '"quoted, and comma"',
      '',
      'normal text',
    ),
    // Null and undefined
    fc.constant(null),
    fc.constant(undefined),
    // Numbers
    fc.integer({ min: -10000, max: 10000 }),
    fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    // Booleans
    fc.boolean(),
  );
}

/**
 * Generate a row (record) for a given set of columns.
 */
function arbRow(columns: string[]): fc.Arbitrary<Record<string, unknown>> {
  const arbs: Record<string, fc.Arbitrary<unknown>> = {};
  for (const col of columns) {
    arbs[col] = arbCellValue();
  }
  return fc.record(arbs);
}

/**
 * Serialize a value to its expected CSV cell representation (mirrors csv-serializer logic).
 */
function expectedCellString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 43: CSV export round-trips the filtered rows under the displayed header (Req 20.1, 20.2, 20.5)', () => {
  const fixedTimestamp = 1719849600000;

  it('the header row in the export matches the provided column list', () => {
    fc.assert(
      fc.property(arbColumns(), (columns) => {
        const result = buildCsvExport(
          {
            pageName: 'test',
            billingMonth: '2026-04',
            columns,
            rows: [],
          },
          fixedTimestamp,
        );

        const { header } = parseCsvContent(result.content);
        expect(header).toEqual(columns);
      }),
      { numRuns: 100 },
    );
  });

  it('empty rows produce header-only CSV (Req 20.5)', () => {
    fc.assert(
      fc.property(arbColumns(), (columns) => {
        const result = buildCsvExport(
          {
            pageName: 'export',
            billingMonth: '2026-05',
            columns,
            rows: [],
          },
          fixedTimestamp,
        );

        const { header, rows } = parseCsvContent(result.content);
        expect(header).toEqual(columns);
        expect(rows).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('exporting rows and parsing back produces the same cell values in order', () => {
    fc.assert(
      fc.property(
        arbColumns().chain((columns) =>
          fc.tuple(
            fc.constant(columns),
            fc.array(arbRow(columns), { minLength: 1, maxLength: 20 }),
          ),
        ),
        ([columns, rows]) => {
          const result = buildCsvExport(
            {
              pageName: 'roundtrip',
              billingMonth: '2026-04',
              columns,
              rows,
            },
            fixedTimestamp,
          );

          const parsed = parseCsvContent(result.content);

          // Header matches columns
          expect(parsed.header).toEqual(columns);

          // Same number of data rows
          expect(parsed.rows).toHaveLength(rows.length);

          // Each row's cells match the expected serialized values
          for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
            const originalRow = rows[rowIdx];
            const parsedRow = parsed.rows[rowIdx];

            expect(parsedRow).toHaveLength(columns.length);

            for (let colIdx = 0; colIdx < columns.length; colIdx++) {
              const col = columns[colIdx];
              const expected = expectedCellString(originalRow[col]);
              expect(parsedRow[colIdx]).toBe(expected);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('RFC 4180 quoting is properly handled for fields with commas, quotes, and newlines', () => {
    // Generate rows where cell values specifically contain special characters
    const specialValues = fc.constantFrom(
      'value, with comma',
      'say "hello"',
      'line1\nline2',
      'cr\r\nlf',
      '"start, "middle", end"',
      'mixed: comma, "quote", and\nnewline',
      '',
    );

    const arbSpecialRow = (columns: string[]): fc.Arbitrary<Record<string, unknown>> => {
      const arbs: Record<string, fc.Arbitrary<unknown>> = {};
      for (const col of columns) {
        arbs[col] = specialValues;
      }
      return fc.record(arbs);
    };

    fc.assert(
      fc.property(
        arbColumns().chain((columns) =>
          fc.tuple(
            fc.constant(columns),
            fc.array(arbSpecialRow(columns), { minLength: 1, maxLength: 10 }),
          ),
        ),
        ([columns, rows]) => {
          const result = buildCsvExport(
            {
              pageName: 'quoting',
              billingMonth: '2026-04',
              columns,
              rows,
            },
            fixedTimestamp,
          );

          const parsed = parseCsvContent(result.content);

          // Header matches
          expect(parsed.header).toEqual(columns);

          // Same number of rows
          expect(parsed.rows).toHaveLength(rows.length);

          // Each cell round-trips correctly
          for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
            const originalRow = rows[rowIdx];
            const parsedRow = parsed.rows[rowIdx];

            for (let colIdx = 0; colIdx < columns.length; colIdx++) {
              const col = columns[colIdx];
              const expected = expectedCellString(originalRow[col]);
              expect(parsedRow[colIdx]).toBe(expected);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
