import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseRow } from './row-parser.js';
import {
  monthlySummarySchema,
  dailyUsageSchema,
  modelUsageSchema,
  keyUsageSchema,
  requestDetailSchema,
  type RecordSchema,
  type ColumnSchema,
} from './schemas.js';

/**
 * Property 7: Invalid rows are rejected and report every failing field.
 *
 * For any row in which one or more values fail type conversion or one or more
 * required fields (per record type) are empty, the parser rejects the row and
 * the recorded failure list contains exactly the offending field names paired
 * with their raw values, having still evaluated the remaining fields.
 *
 * Validates: Requirements 2.9, 2.10
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Values guaranteed to fail every typed codec used in the schemas:
 * - moneyUsd rejects non-numeric tokens
 * - tokenCount rejects negative / fractional / non-numeric
 * - timestampTz rejects arbitrary text
 * - streamBool rejects arbitrary text
 * - numeric rejects arbitrary text
 * - text (the only codec that never fails) is excluded from injection targets
 *
 * These strings are carefully chosen to fail all typed codecs while remaining
 * non-empty (so they don't trigger the empty-required-field path instead).
 */
const INVALID_VALUES = [
  'abc',
  'not-a-number',
  '1.2.3',
  '--5',
  'NaN',
  'Infinity',
  '$100',
  'true!',
  '2026-99-99',
  'x',
] as const;

const invalidValueArb = fc.constantFrom(...INVALID_VALUES);

/**
 * For a given schema, produce the list of columns whose codecs can actually
 * fail (i.e. not text, since text.parse never returns ok:false).
 */
function failableColumns(schema: RecordSchema<unknown>): ColumnSchema[] {
  return schema.columns.filter((col) => {
    // text codec always succeeds - it only trims and maps empty to null.
    // We identify it by testing that it parses 'abc' as ok:true.
    const test = col.codec.parse('abc');
    // If the codec parses arbitrary non-empty text, it's text-like and can't fail.
    // But we also need to check it doesn't fail on basic values.
    // Better heuristic: text codec maps 'abc' -> { ok: true, value: 'abc' }
    return !(test.ok && test.value === 'abc');
  });
}

/**
 * Required columns whose codec is text (i.e. user_id, model, api_key_id,
 * request_id). These fail only when they're empty, not via codec failure.
 */
function requiredTextColumns(schema: RecordSchema<unknown>): ColumnSchema[] {
  return schema.columns.filter((col) => {
    if (!col.required) return false;
    const test = col.codec.parse('abc');
    return test.ok && test.value === 'abc';
  });
}

// Schema configs for test parameterization
const ALL_SCHEMAS: Array<{ name: string; schema: RecordSchema<unknown> }> = [
  { name: 'monthly_summary', schema: monthlySummarySchema as RecordSchema<unknown> },
  { name: 'daily_usage', schema: dailyUsageSchema as RecordSchema<unknown> },
  { name: 'model_usage', schema: modelUsageSchema as RecordSchema<unknown> },
  { name: 'key_usage', schema: keyUsageSchema as RecordSchema<unknown> },
  { name: 'request_detail', schema: requestDetailSchema as RecordSchema<unknown> },
];

/**
 * Build a valid raw-values array for a schema so that all fields pass.
 * This gives us a "green" baseline we can selectively corrupt.
 */
function buildValidRow(schema: RecordSchema<unknown>): { header: string[]; values: string[] } {
  const header = schema.columns.map((c) => c.field);
  const values = schema.columns.map((col) => {
    // Provide a value that passes each codec type
    const testValues: Record<string, string> = {
      billing_month: '2026-05',
      user_id: '42',
      usage_date: '2026-05-15',
      model: 'gpt-4',
      api_key_id: 'key-1',
      api_key_name: 'my-key',
      request_id: 'req-001',
      email: 'user@example.com',
      username: 'testuser',
    };
    if (testValues[col.field]) return testValues[col.field]!;

    // Determine by codec behavior what value to use
    const numTest = col.codec.parse('100');
    if (numTest.ok) return '100';
    const tsTest = col.codec.parse('2026-05-15');
    if (tsTest.ok) return '2026-05-15';
    const boolTest = col.codec.parse('true');
    if (boolTest.ok) return 'true';
    // Default: any non-empty text
    return 'valid-text';
  });
  return { header, values };
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 7: Invalid rows are rejected and report every failing field (Req 2.9, 2.10)', () => {
  for (const { name, schema } of ALL_SCHEMAS) {
    const failable = failableColumns(schema);
    const requiredText = requiredTextColumns(schema);

    if (failable.length > 0) {
      it(`[${name}] rejects a row with codec failures and reports all failing fields`, () => {
        // Generate a non-empty subset of failable columns to corrupt
        const subsetArb = fc
          .subarray(failable, { minLength: 1 })
          .filter((arr) => arr.length >= 1);

        fc.assert(
          fc.property(
            subsetArb,
            fc.array(invalidValueArb, { minLength: 1, maxLength: 10 }),
            fc.integer({ min: 1, max: 10000 }),
            (corruptedColumns, invalidPool, rowNumber) => {
              const { header, values } = buildValidRow(schema);

              // Inject invalid values into the chosen columns
              const expectedFailures = new Map<string, string>();
              for (let i = 0; i < corruptedColumns.length; i++) {
                const col = corruptedColumns[i]!;
                const colIndex = header.indexOf(col.field);
                const badValue = invalidPool[i % invalidPool.length]!;
                values[colIndex] = badValue;
                expectedFailures.set(col.field, badValue);
              }

              const result = parseRow(values, header, schema, rowNumber);

              // 1. Row must be rejected (no record produced)
              expect(result.record).toBeUndefined();
              expect(result.failures.length).toBeGreaterThan(0);

              // 2. Row number is reported correctly
              expect(result.rowNumber).toBe(rowNumber);

              // 3. Every corrupted field appears in the failures
              for (const [field, rawValue] of expectedFailures) {
                const failure = result.failures.find((f) => f.field === field);
                expect(
                  failure,
                  `Expected field "${field}" to appear in failures for schema "${name}"`,
                ).toBeDefined();
                expect(failure!.rawValue).toBe(rawValue);
              }

              // 4. The parser evaluated ALL remaining fields (failure count >= expected)
              expect(result.failures.length).toBeGreaterThanOrEqual(expectedFailures.size);
            },
          ),
        );
      });
    }

    if (requiredText.length > 0) {
      it(`[${name}] rejects a row with empty required fields and reports all of them`, () => {
        // Generate a non-empty subset of required text columns to leave empty
        const subsetArb = fc
          .subarray(requiredText, { minLength: 1 })
          .filter((arr) => arr.length >= 1);

        fc.assert(
          fc.property(
            subsetArb,
            fc.integer({ min: 1, max: 10000 }),
            (emptiedColumns, rowNumber) => {
              const { header, values } = buildValidRow(schema);

              // Clear the chosen required fields
              const expectedEmpty = new Set<string>();
              for (const col of emptiedColumns) {
                const colIndex = header.indexOf(col.field);
                values[colIndex] = '';
                expectedEmpty.add(col.field);
              }

              const result = parseRow(values, header, schema, rowNumber);

              // 1. Row must be rejected
              expect(result.record).toBeUndefined();
              expect(result.failures.length).toBeGreaterThan(0);

              // 2. Row number is reported
              expect(result.rowNumber).toBe(rowNumber);

              // 3. Every emptied required field appears in the failure list
              for (const field of expectedEmpty) {
                const failure = result.failures.find((f) => f.field === field);
                expect(
                  failure,
                  `Expected required field "${field}" to appear in failures`,
                ).toBeDefined();
                expect(failure!.rawValue).toBe('');
              }
            },
          ),
        );
      });
    }

    it(`[${name}] reports both empty-required AND codec failures in the same row`, () => {
      const hasRequired = requiredText.length > 0;
      const hasFailable = failable.length > 0;
      if (!hasRequired || !hasFailable) return; // skip if the schema doesn't support both

      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          invalidValueArb,
          (rowNumber, invalidValue) => {
            const { header, values } = buildValidRow(schema);

            // Empty one required text field
            const reqCol = requiredText[0]!;
            const reqIndex = header.indexOf(reqCol.field);
            values[reqIndex] = '';

            // Corrupt one failable field
            const failCol = failable[0]!;
            const failIndex = header.indexOf(failCol.field);
            values[failIndex] = invalidValue;

            const result = parseRow(values, header, schema, rowNumber);

            // Row rejected
            expect(result.record).toBeUndefined();

            // Both failures present (parser didn't short-circuit)
            const failedFields = result.failures.map((f) => f.field);
            expect(failedFields).toContain(reqCol.field);
            expect(failedFields).toContain(failCol.field);

            // Raw values match what we injected
            const reqFailure = result.failures.find((f) => f.field === reqCol.field)!;
            expect(reqFailure.rawValue).toBe('');

            const codecFailure = result.failures.find((f) => f.field === failCol.field)!;
            expect(codecFailure.rawValue).toBe(invalidValue);

            // Row number preserved
            expect(result.rowNumber).toBe(rowNumber);
          },
        ),
      );
    });
  }

  it('failure list size equals exactly the number of offending fields (no extras, no omissions)', () => {
    // Use monthly_summary since it has many optional typed fields we can corrupt
    const schema = monthlySummarySchema as RecordSchema<unknown>;
    const failable = failableColumns(schema);

    // Pick exactly N failable columns and corrupt them; expect exactly N failures
    const subsetArb = fc
      .subarray(failable, { minLength: 1, maxLength: Math.min(failable.length, 5) })
      .filter((arr) => arr.length >= 1);

    fc.assert(
      fc.property(
        subsetArb,
        fc.array(invalidValueArb, { minLength: 5, maxLength: 5 }),
        (corruptedColumns, invalidPool) => {
          const { header, values } = buildValidRow(schema);

          for (let i = 0; i < corruptedColumns.length; i++) {
            const col = corruptedColumns[i]!;
            const colIndex = header.indexOf(col.field);
            values[colIndex] = invalidPool[i % invalidPool.length]!;
          }

          const result = parseRow(values, header, schema, 1);

          // Exactly the corrupted columns should fail — no more, no less
          expect(result.failures.length).toBe(corruptedColumns.length);
          const failedFields = new Set(result.failures.map((f) => f.field));
          for (const col of corruptedColumns) {
            expect(failedFields.has(col.field)).toBe(true);
          }
        },
      ),
    );
  });
});
