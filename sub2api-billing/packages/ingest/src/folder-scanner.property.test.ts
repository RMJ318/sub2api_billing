import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { fillBillingMonthFromFolder, isValidBillingMonthFolder } from './folder-scanner.js';

/**
 * Property 9: Billing_Month falls back to the folder name.
 *
 * Design statement: "For any record whose `billing_month` value is empty or
 * whitespace-only ingested from a folder named `YYYY-MM`, the loaded record's
 * Billing_Month equals the folder-derived month; a record with a populated
 * `billing_month` retains its own value."
 *
 * Validates: Requirements 1.3
 *
 * The arbitraries below generate valid `YYYY-MM` folder names plus records that
 * carry an extra `payload` field so we can assert the fallback (a) fills only
 * blank Billing_Months, (b) leaves populated ones untouched, and (c) never
 * mutates the input record nor drops its other fields.
 */

/** Valid `YYYY-MM` folder names: four-digit year, hyphen, month 01-12. */
const validFolderName: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 1, max: 12 }))
  .map(([year, month]) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`);

/** Whitespace-only strings (spaces, tabs, newlines, carriage returns). */
const whitespaceOnly: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), { minLength: 1, maxLength: 5 })
  .map((parts) => parts.join(''));

/** Blank Billing_Month values: the empty string or whitespace-only strings. */
const blankBillingMonth: fc.Arbitrary<string> = fc.oneof(fc.constant(''), whitespaceOnly);

/**
 * Populated Billing_Month values: any string with at least one non-whitespace
 * character. These must be retained as-is regardless of the folder name.
 */
const populatedBillingMonth: fc.Arbitrary<string> = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim().length > 0);

/** A record exposing `billing_month` plus an unrelated field, as the real records do. */
interface TestRecord {
  billing_month: string;
  payload: string;
}

const recordWith = (billingMonth: fc.Arbitrary<string>): fc.Arbitrary<TestRecord> =>
  fc.record({ billing_month: billingMonth, payload: fc.string() });

describe('fillBillingMonthFromFolder (Property 9: Billing_Month falls back to the folder name)', () => {
  it('fills a blank billing_month with the folder-derived month', () => {
    fc.assert(
      fc.property(recordWith(blankBillingMonth), validFolderName, (record, folderName) => {
        // Precondition sanity: the generated folder name is a valid billing folder.
        expect(isValidBillingMonthFolder(folderName)).toBe(true);

        const filled = fillBillingMonthFromFolder(record, folderName);

        // The blank Billing_Month is replaced by the folder name itself.
        expect(filled.billing_month).toBe(folderName);
        // Other fields are preserved.
        expect(filled.payload).toBe(record.payload);
      }),
      { numRuns: 100 },
    );
  });

  it('retains a populated billing_month regardless of the folder name', () => {
    fc.assert(
      fc.property(recordWith(populatedBillingMonth), validFolderName, (record, folderName) => {
        const original = record.billing_month;

        const filled = fillBillingMonthFromFolder(record, folderName);

        // The record keeps its own Billing_Month, not the folder's.
        expect(filled.billing_month).toBe(original);
        expect(filled.payload).toBe(record.payload);
      }),
      { numRuns: 100 },
    );
  });

  it('never mutates the input record', () => {
    const anyBillingMonth = fc.oneof(blankBillingMonth, populatedBillingMonth);
    fc.assert(
      fc.property(recordWith(anyBillingMonth), validFolderName, (record, folderName) => {
        const snapshot = { ...record };

        fillBillingMonthFromFolder(record, folderName);

        // The original record's fields are unchanged after the call.
        expect(record.billing_month).toBe(snapshot.billing_month);
        expect(record.payload).toBe(snapshot.payload);
      }),
      { numRuns: 100 },
    );
  });
});
