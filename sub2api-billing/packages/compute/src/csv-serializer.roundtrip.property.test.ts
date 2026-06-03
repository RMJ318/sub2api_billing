/**
 * Property 8: CSV serialize/parse round-trip preserves the record schema.
 *
 * For any valid record of a given type (including string fields containing
 * commas, quotes, or newlines), serializing it to a CSV row and parsing it
 * back — with header columns in any order — yields an equivalent record
 * exposing every documented field under its documented name.
 *
 * Validates: Requirements 2.1, 2.2, 2.11
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { serializeCsvRow } from './csv-serializer.js';
import { parseRow } from './parser/row-parser.js';
import {
  monthlySummarySchema,
  dailyUsageSchema,
  modelUsageSchema,
  keyUsageSchema,
  requestDetailSchema,
  type RecordSchema,
  type ColumnSchema,
} from './parser/schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the "type" of a column from its codec behavior so we can generate
 * values that will survive the round-trip. We probe the codec with known values.
 */
type ColumnType = 'moneyUsd' | 'tokenCount' | 'timestampTz' | 'streamBool' | 'text' | 'numeric';

function classifyCodec(col: ColumnSchema): ColumnType {
  // text: parses any non-empty string and returns trimmed value
  const textCheck = col.codec.parse('abc');
  if (textCheck.ok && textCheck.value === 'abc') return 'text';

  // streamBool: parses 'true'/'false'
  const boolCheck = col.codec.parse('true');
  if (boolCheck.ok && boolCheck.value === true) return 'streamBool';

  // timestampTz: parses ISO dates
  const tsCheck = col.codec.parse('2026-05-15T10:30:00.000Z');
  if (tsCheck.ok && tsCheck.value instanceof Date) return 'timestampTz';

  // moneyUsd: parses decimals to Decimal instances
  const moneyCheck = col.codec.parse('12.50');
  if (moneyCheck.ok && moneyCheck.value instanceof Decimal) return 'moneyUsd';

  // tokenCount vs numeric: tokenCount rejects '-1', numeric accepts it
  const negCheck = col.codec.parse('-1');
  if (negCheck.ok) return 'numeric';

  return 'tokenCount';
}

// ---------------------------------------------------------------------------
// Generators for each codec type
// ---------------------------------------------------------------------------

/** Arbitrary for moneyUsd values: Decimal with up to 6 fractional digits. */
function arbMoneyUsd(): fc.Arbitrary<Decimal> {
  return fc
    .tuple(
      fc.boolean(), // negative sign
      fc.integer({ min: 0, max: 999999 }), // integer part
      fc.integer({ min: 0, max: 6 }), // fractional digit count
      fc.integer({ min: 0, max: 999999 }), // fractional digits (padded)
    )
    .map(([negative, intPart, fracDigits, fracRaw]) => {
      if (fracDigits === 0) {
        const sign = negative ? '-' : '';
        return new Decimal(`${sign}${intPart}`);
      }
      const fracStr = String(fracRaw).padStart(fracDigits, '0').slice(0, fracDigits);
      const sign = negative && (intPart > 0 || fracRaw > 0) ? '-' : '';
      return new Decimal(`${sign}${intPart}.${fracStr}`);
    });
}

/** Arbitrary for tokenCount values: non-negative integers. */
function arbTokenCount(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 1_000_000 });
}

/** Arbitrary for numeric values: finite numbers with decimal parts. */
function arbNumeric(): fc.Arbitrary<number> {
  return fc
    .tuple(
      fc.boolean(), // negative
      fc.integer({ min: 0, max: 999999 }),
      fc.integer({ min: 0, max: 99 }), // 2-digit fraction
    )
    .map(([neg, intPart, frac]) => {
      const n = intPart + frac / 100;
      return neg ? -n : n;
    });
}

/**
 * Arbitrary for timestampTz values: valid Date objects.
 * We constrain to dates that parse cleanly in ISO 8601 format.
 */
function arbTimestamp(): fc.Arbitrary<Date> {
  // Years 2020-2030, valid months/days/hours/minutes/seconds
  return fc
    .tuple(
      fc.integer({ min: 2020, max: 2030 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 }), // avoid month-length issues
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 }),
      fc.integer({ min: 0, max: 59 }),
      fc.integer({ min: 0, max: 999 }),
    )
    .map(([year, month, day, hour, min, sec, ms]) => {
      return new Date(Date.UTC(year, month - 1, day, hour, min, sec, ms));
    });
}

/** Arbitrary for streamBool: true or false. */
function arbStreamBool(): fc.Arbitrary<boolean> {
  return fc.boolean();
}

/**
 * Arbitrary for text fields: strings that may contain RFC 4180 special chars
 * (commas, double quotes, newlines) to exercise quoting. We must avoid strings
 * that would produce only whitespace (which would round-trip to null).
 */
function arbText(): fc.Arbitrary<string> {
  const specialChars = fc.constantFrom(',', '"', '\n', '\r\n', ' ');
  const normalChars = fc.string({ minLength: 1, maxLength: 10 })
    .filter((s) => s.trim().length > 0);

  return fc
    .oneof(
      // Normal text (most common)
      normalChars,
      // Text with embedded specials
      fc
        .tuple(normalChars, specialChars, normalChars)
        .map(([a, s, b]) => a + s + b),
    )
    .filter((s) => s.trim().length > 0); // must not round-trip to null
}

// ---------------------------------------------------------------------------
// Record generator
// ---------------------------------------------------------------------------

/**
 * Generate a valid record for a given schema. Required fields always get a
 * non-null value; optional fields randomly get a value or null.
 */
function arbRecord(schema: RecordSchema<unknown>): fc.Arbitrary<Record<string, unknown>> {
  const arbs: Record<string, fc.Arbitrary<unknown>> = {};

  for (const col of schema.columns) {
    const codecType = classifyCodec(col);
    let valueArb: fc.Arbitrary<unknown>;

    switch (codecType) {
      case 'moneyUsd':
        valueArb = arbMoneyUsd();
        break;
      case 'tokenCount':
        valueArb = arbTokenCount();
        break;
      case 'numeric':
        valueArb = arbNumeric();
        break;
      case 'timestampTz':
        valueArb = arbTimestamp();
        break;
      case 'streamBool':
        valueArb = arbStreamBool();
        break;
      case 'text':
        valueArb = arbText();
        break;
    }

    if (col.required) {
      arbs[col.field] = valueArb;
    } else {
      // Optional fields: 30% chance of null
      arbs[col.field] = fc.oneof(
        { weight: 7, arbitrary: valueArb },
        { weight: 3, arbitrary: fc.constant(null) },
      );
    }
  }

  return fc.record(arbs as Record<string, fc.Arbitrary<unknown>>);
}

/**
 * Compare two record values for equivalence after a round-trip.
 * - Decimal: compare via .toString() (both should have equal string representations)
 * - Date: compare via .getTime()
 * - null ↔ null
 * - boolean, number, string: strict equality
 */
function assertRecordEquivalent(
  original: Record<string, unknown>,
  parsed: Record<string, unknown>,
  schema: RecordSchema<unknown>,
): void {
  for (const col of schema.columns) {
    const origVal = original[col.field];
    const parsedVal = parsed[col.field];

    if (origVal === null || origVal === undefined) {
      expect(parsedVal, `Field "${col.field}" should be null`).toBeNull();
      continue;
    }

    if (origVal instanceof Decimal) {
      expect(parsedVal, `Field "${col.field}" should be a Decimal`).toBeInstanceOf(Decimal);
      expect(
        (parsedVal as Decimal).eq(origVal),
        `Field "${col.field}": expected ${origVal.toString()}, got ${(parsedVal as Decimal).toString()}`,
      ).toBe(true);
      continue;
    }

    if (origVal instanceof Date) {
      expect(parsedVal, `Field "${col.field}" should be a Date`).toBeInstanceOf(Date);
      expect(
        (parsedVal as Date).getTime(),
        `Field "${col.field}": date mismatch`,
      ).toBe(origVal.getTime());
      continue;
    }

    if (typeof origVal === 'boolean') {
      expect(parsedVal, `Field "${col.field}" should be boolean`).toBe(origVal);
      continue;
    }

    if (typeof origVal === 'number') {
      expect(parsedVal, `Field "${col.field}" should be a number`).toBeCloseTo(origVal, 10);
      continue;
    }

    if (typeof origVal === 'string') {
      // text codec trims, so compare trimmed values
      expect(parsedVal, `Field "${col.field}" should match`).toBe(origVal.trim());
      continue;
    }

    // Fallback
    expect(parsedVal).toEqual(origVal);
  }
}

// ---------------------------------------------------------------------------
// Schemas to test
// ---------------------------------------------------------------------------

const ALL_SCHEMAS: Array<{ name: string; schema: RecordSchema<unknown> }> = [
  { name: 'monthly_summary', schema: monthlySummarySchema as RecordSchema<unknown> },
  { name: 'daily_usage', schema: dailyUsageSchema as RecordSchema<unknown> },
  { name: 'model_usage', schema: modelUsageSchema as RecordSchema<unknown> },
  { name: 'key_usage', schema: keyUsageSchema as RecordSchema<unknown> },
  { name: 'request_detail', schema: requestDetailSchema as RecordSchema<unknown> },
];

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 8: CSV serialize/parse round-trip preserves the record schema (Req 2.1, 2.2, 2.11)', () => {
  for (const { name, schema } of ALL_SCHEMAS) {
    it(`[${name}] round-trips valid records through serialize → parse`, () => {
      const header = schema.columns.map((c) => c.field);

      fc.assert(
        fc.property(arbRecord(schema), (record) => {
          // Serialize to CSV row
          const csvRow = serializeCsvRow(record as Record<string, unknown>, header);

          // Split the CSV row back into fields using csv-parse-compatible splitting.
          // The serializer produces RFC 4180, so we need to split respecting quotes.
          const rawValues = splitCsvRow(csvRow);

          // Parse back using the row parser
          const result = parseRow(rawValues, header, schema, 1);

          // Must produce a valid record (no failures)
          expect(
            result.failures,
            `Expected no parse failures for ${name}, got: ${JSON.stringify(result.failures)}`,
          ).toHaveLength(0);
          expect(result.record).toBeDefined();

          // Compare fields
          assertRecordEquivalent(
            record as Record<string, unknown>,
            result.record as Record<string, unknown>,
            schema,
          );
        }),
        { numRuns: 100 },
      );
    });

    it(`[${name}] round-trips with shuffled header column order`, () => {
      fc.assert(
        fc.property(
          arbRecord(schema),
          fc.shuffledSubarray(schema.columns.map((c) => c.field), {
            minLength: schema.columns.length,
            maxLength: schema.columns.length,
          }),
          (record, shuffledHeader) => {
            // Serialize using the shuffled header order
            const csvRow = serializeCsvRow(
              record as Record<string, unknown>,
              shuffledHeader,
            );

            // Split back
            const rawValues = splitCsvRow(csvRow);

            // Parse with the same shuffled header
            const result = parseRow(rawValues, shuffledHeader, schema, 1);

            // Must succeed
            expect(
              result.failures,
              `Parse failures with shuffled header: ${JSON.stringify(result.failures)}`,
            ).toHaveLength(0);
            expect(result.record).toBeDefined();

            // Compare fields
            assertRecordEquivalent(
              record as Record<string, unknown>,
              result.record as Record<string, unknown>,
              schema,
            );
          },
        ),
        { numRuns: 50 },
      );
    });
  }

  it('RFC 4180 quoting survives fields with commas, quotes, and newlines', () => {
    // Use a simple schema (model_usage has required text fields)
    const schema = modelUsageSchema as RecordSchema<unknown>;
    const header = schema.columns.map((c) => c.field);

    // Generate records where text fields specifically contain special chars
    const specialTextArb = fc
      .tuple(
        fc.constantFrom(
          'value, with comma',
          'value "with" quotes',
          'line1\nline2',
          'cr\r\nlf',
          '"comma, and "quotes""',
          'all: commas, "quotes", and\nnewlines',
        ),
      )
      .map(([specialVal]) => {
        // Build a minimal valid record with the special value in a text field
        const record: Record<string, unknown> = {};
        for (const col of schema.columns) {
          if (col.field === 'user_id') {
            record[col.field] = specialVal;
          } else if (col.field === 'model') {
            record[col.field] = 'gpt-4';
          } else if (col.field === 'billing_month') {
            record[col.field] = '2026-05';
          } else {
            record[col.field] = null;
          }
        }
        return record;
      });

    fc.assert(
      fc.property(specialTextArb, (record) => {
        const csvRow = serializeCsvRow(record, header);
        const rawValues = splitCsvRow(csvRow);
        const result = parseRow(rawValues, header, schema, 1);

        expect(result.failures).toHaveLength(0);
        expect(result.record).toBeDefined();

        // The text codec trims, so compare trimmed original
        const originalUserId = (record['user_id'] as string).trim();
        expect((result.record as Record<string, unknown>)['user_id']).toBe(originalUserId);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// RFC 4180 CSV row splitter (mirrors what csv-parse does)
// ---------------------------------------------------------------------------

/**
 * Split a single CSV row string into fields, respecting RFC 4180 quoting.
 * This is the inverse of the serializer's quoting and is used to feed the
 * row parser (which normally receives pre-split arrays from csv-parse).
 */
function splitCsvRow(row: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= row.length) {
    if (i === row.length) {
      // Trailing empty field after final comma
      fields.push('');
      break;
    }

    if (row[i] === '"') {
      // Quoted field
      let value = '';
      i++; // skip opening quote
      while (i < row.length) {
        if (row[i] === '"') {
          if (i + 1 < row.length && row[i + 1] === '"') {
            // Escaped quote
            value += '"';
            i += 2;
          } else {
            // Closing quote
            i++; // skip closing quote
            break;
          }
        } else {
          value += row[i];
          i++;
        }
      }
      fields.push(value);
      // Skip comma separator (or end of string)
      if (i < row.length && row[i] === ',') {
        i++;
      }
    } else {
      // Unquoted field
      const commaIdx = row.indexOf(',', i);
      if (commaIdx === -1) {
        fields.push(row.slice(i));
        break;
      } else {
        fields.push(row.slice(i, commaIdx));
        i = commaIdx + 1;
      }
    }
  }

  return fields;
}
