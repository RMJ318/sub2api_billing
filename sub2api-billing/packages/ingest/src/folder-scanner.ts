/**
 * Folder scanner predicates for monthly billing-folder discovery (Requirement 1).
 *
 * These are the pure, side-effect-free helpers used by the Ingestion Service to
 * decide which immediate subfolders of the billing root are monthly billing
 * folders and to derive each folder's Billing_Month. The filesystem traversal,
 * file reading, and ingestion orchestration live in separate modules (tasks
 * 15.3/15.5); this module contains only the decision logic so it can be reused
 * and exhaustively tested in isolation.
 *
 * @see design "Ingestion Service" — `isValidBillingMonthFolder`,
 *      `billingMonthFromFolder`, and the "fill billing_month from folder if
 *      empty" step of the ingestion sequence.
 */

/**
 * The documented Billing_Month folder pattern (Requirement 1.1):
 * a four-digit year, a hyphen, and a two-digit month in the range `01`–`12`.
 *
 * Anchored with `^`/`$` so the whole folder name must match exactly. Without
 * the `m` flag, JavaScript's `$` matches only the absolute end of the string
 * (and not before a trailing newline), so names such as `"2026-04\n"` are
 * correctly rejected.
 */
const BILLING_MONTH_FOLDER_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Decide whether a folder name is a monthly billing folder (Requirement 1.1).
 *
 * A name qualifies when it matches `^\d{4}-(0[1-9]|1[0-2])$`: a four-digit year,
 * a hyphen, and a two-digit month from `01` through `12`. Any other name —
 * including `YYYY-MM` with month `00` or `13`, the wrong number of digits, or
 * surrounding whitespace — is not a billing folder.
 *
 * This is a pure predicate; the scanner uses it to keep only the immediate,
 * non-recursive subfolders that should be ingested.
 *
 * @param name - The folder name (a single path segment, not a full path).
 * @returns `true` when the name is a valid `YYYY-MM` billing folder.
 */
export function isValidBillingMonthFolder(name: string): boolean {
  return BILLING_MONTH_FOLDER_PATTERN.test(name);
}

/**
 * Derive the Billing_Month for a billing folder (Requirement 1.3).
 *
 * A valid billing folder is named exactly in `YYYY-MM` form, so its
 * Billing_Month is the folder name itself. The function validates the name
 * first and throws on a non-billing folder, because deriving a month from a
 * name the scanner never accepted would indicate a caller error rather than
 * recoverable data. Callers should gate on {@link isValidBillingMonthFolder}.
 *
 * @param name - A folder name expected to match the `YYYY-MM` pattern.
 * @returns The Billing_Month in `YYYY-MM` format (equal to `name`).
 * @throws {RangeError} When `name` is not a valid billing folder.
 */
export function billingMonthFromFolder(name: string): string {
  if (!isValidBillingMonthFolder(name)) {
    throw new RangeError(
      `Cannot derive a Billing_Month from "${name}": not a YYYY-MM billing folder.`,
    );
  }
  return name;
}

/**
 * Fill a record's `billing_month` from its containing folder when it is empty
 * (Requirement 1.3, design Property 9).
 *
 * The Billing_Month fallback: a record whose `billing_month` is empty or
 * whitespace-only is assigned the folder-derived month; a record that already
 * carries a populated `billing_month` retains its own value unchanged. The
 * input record is never mutated — when the fallback applies, a shallow copy
 * with the corrected `billing_month` is returned; otherwise the original record
 * is returned as-is.
 *
 * Works across all five normalized record types, which each expose a
 * `billing_month: string` field.
 *
 * @typeParam T - Any record exposing a `billing_month` string field.
 * @param record - The parsed record whose Billing_Month may need filling.
 * @param folderName - The `YYYY-MM` folder the record was ingested from.
 * @returns The record with a populated `billing_month`.
 * @throws {RangeError} When the fallback is needed but `folderName` is not a
 *   valid billing folder.
 */
export function fillBillingMonthFromFolder<T extends { billing_month: string }>(
  record: T,
  folderName: string,
): T {
  if (record.billing_month.trim().length > 0) {
    return record;
  }
  return { ...record, billing_month: billingMonthFromFolder(folderName) };
}
