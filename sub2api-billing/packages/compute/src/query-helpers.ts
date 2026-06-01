/**
 * Sorting, search, and date-range helpers (design "Aggregation and Compute
 * Library", filtering/sorting helpers).
 *
 * These are the pure, deterministic building blocks the User/Model/API Key and
 * request-detail surfaces use to order, search, and time-scope rows before
 * pagination. They are side-effect free and are the target of design
 * Properties 20 (sorting), 21 (case-insensitive search), 24 (inclusive
 * date-range filtering), and 25 (date-range rejection).
 *
 * Money columns are compared with `decimal.js` so the sort agrees with the
 * decimal aggregates elsewhere in the compute core (Requirement 2.3), rather
 * than drifting through native floating point.
 */
import { Decimal } from 'decimal.js';
import type { DateRange, SortDir } from './types/query.js';

/**
 * A value that can be used as a sort key for a column.
 *
 * Covers the column types present in the normalized records: numeric metrics
 * (`number`), money fields (`Decimal`), text labels (`string`), flags
 * (`boolean`), and timestamps (`Date`). `null`/`undefined` denote an
 * absent/empty cell.
 */
export type SortValue = number | string | boolean | Date | Decimal | null | undefined;

/**
 * Total ordering over two `number`s that is also defined on `NaN`.
 *
 * Returns a negative, zero, or positive number when `a` is respectively less
 * than, equal to, or greater than `b`. `NaN` is ordered as greater than every
 * real number and equal to itself, so a column containing `NaN` still yields a
 * stable, total comparison rather than the partial ordering native `<`/`>`
 * produce.
 */
function compareNumber(a: number, b: number): number {
  if (Number.isNaN(a) || Number.isNaN(b)) {
    if (Number.isNaN(a) && Number.isNaN(b)) {
      return 0;
    }
    return Number.isNaN(a) ? 1 : -1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compare two column values, yielding a total ascending ordering.
 *
 * Returns a negative number when `a` sorts before `b`, a positive number when
 * `a` sorts after `b`, and `0` when they are equal under the column's type:
 * - `null`/`undefined` sort before every present value (and equal each other).
 * - `Decimal` money values compare by decimal magnitude (`NaN` sorts last).
 * - `Date` values compare by their epoch milliseconds.
 * - `number` values compare numerically (`NaN` sorts last).
 * - `boolean` values order `false` before `true`.
 * - Otherwise values compare by their string form using code-point order.
 *
 * The function assumes a column is homogeneous (every cell shares a type),
 * which holds for the normalized records; mixed-type inputs fall back to the
 * string comparison.
 *
 * @param a - The left value.
 * @param b - The right value.
 * @returns A negative, zero, or positive number for `a < b`, `a == b`, `a > b`.
 */
export function compareValues(a: SortValue, b: SortValue): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull || bNull) {
    if (aNull && bNull) {
      return 0;
    }
    return aNull ? -1 : 1;
  }
  if (a instanceof Decimal && b instanceof Decimal) {
    if (a.isNaN() || b.isNaN()) {
      if (a.isNaN() && b.isNaN()) {
        return 0;
      }
      return a.isNaN() ? 1 : -1;
    }
    return a.comparedTo(b);
  }
  if (a instanceof Date && b instanceof Date) {
    return compareNumber(a.getTime(), b.getTime());
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return compareNumber(a, b);
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? 1 : -1;
  }
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/**
 * Stable sort of rows by a selected column and direction (design Property 20).
 *
 * Returns a new array that is a permutation of `rows` ordered
 * non-decreasingly when `dir` is `'asc'` and non-increasingly when `dir` is
 * `'desc'`, comparing the value produced by `selector` for each row with
 * {@link compareValues}. This backs the user ranking table's column sort
 * (Requirements 3.5, 7.2) and the budget monitoring list's Usage_Percent-
 * descending order (Requirement 9.4).
 *
 * The sort is **stable**: rows whose selected values are equal keep their
 * original relative order in both directions. Stability is guaranteed
 * independently of the host engine by breaking ties on each row's original
 * index. The input array is not mutated.
 *
 * @typeParam T - The row type.
 * @param rows - The records to sort.
 * @param selector - Selects the comparable column value for a row.
 * @param dir - Sort direction; defaults to `'asc'`.
 * @returns A new, stably ordered array containing exactly the input rows.
 */
export function stableSortBy<T>(
  rows: readonly T[],
  selector: (row: T) => SortValue,
  dir: SortDir = 'asc',
): T[] {
  const factor = dir === 'desc' ? -1 : 1;
  const decorated = rows.map((row, index) => ({ row, index, key: selector(row) }));
  decorated.sort((a, b) => {
    const cmp = compareValues(a.key, b.key);
    if (cmp !== 0) {
      return factor * cmp;
    }
    return a.index - b.index;
  });
  return decorated.map((entry) => entry.row);
}

/** The fields a user-search predicate inspects (username + email). */
export interface UserSearchFields {
  username: string | null;
  email: string | null;
}

/**
 * Test whether a single field contains the (already lower-cased) query.
 *
 * A `null` field never matches; a present field matches when its lower-cased
 * form includes `lowerQuery` as a substring. An empty query is contained in
 * every present field.
 */
function fieldContains(field: string | null, lowerQuery: string): boolean {
  return field !== null && field.toLowerCase().includes(lowerQuery);
}

/**
 * Test whether a row matches a case-insensitive username/email search
 * (Requirement 7.3, design Property 21).
 *
 * Returns `true` when the row's `username` or `email` contains `query` under
 * case-insensitive substring matching. A `null` username/email does not match;
 * an empty `query` matches any row that has a present username or email.
 *
 * @param row - The row whose `username`/`email` are inspected.
 * @param query - The search text entered by the user.
 * @returns `true` when either field contains `query` case-insensitively.
 */
export function matchesUserSearch(row: UserSearchFields, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return fieldContains(row.username, lowerQuery) || fieldContains(row.email, lowerQuery);
}

/**
 * Filter rows to those whose username or email matches a search text
 * (Requirement 7.3, design Property 21).
 *
 * Returns exactly the rows for which {@link matchesUserSearch} holds, in their
 * original relative order. Matching is case-insensitive substring matching
 * over `username` and `email`; `null` fields never match. The input array is
 * not mutated.
 *
 * @typeParam T - The row type, exposing `username` and `email`.
 * @param rows - The records to filter.
 * @param query - The search text entered by the user.
 * @returns The subset of `rows` matching `query`.
 */
export function searchByText<T extends UserSearchFields>(
  rows: readonly T[],
  query: string,
): T[] {
  return rows.filter((row) => matchesUserSearch(row, query));
}

/**
 * Whether a date-range selection is valid (Requirement 19.3, design
 * Property 25).
 *
 * A range is valid if and only if its `start` is on or before its `end`; a
 * range whose start is later than its end is rejected. A range whose start
 * equals its end is valid and selects that single instant (the bounds are
 * inclusive — see {@link filterByDateRange}).
 *
 * @param range - The candidate date range.
 * @returns `true` when `start <= end`, `false` when `start` is after `end`.
 */
export function isValidDateRange(range: DateRange): boolean {
  return range.start.getTime() <= range.end.getTime();
}

/**
 * Filter dated rows to an inclusive date range (Requirement 19.2, design
 * Property 24).
 *
 * Returns exactly the rows whose date is greater than or equal to
 * `range.start` and less than or equal to `range.end` (both bounds
 * inclusive), in their original relative order. A row whose date is `null`
 * has no position on the timeline and is excluded. Comparison is by epoch
 * milliseconds, so timezone offsets carried by the `Date`s are respected. The
 * input array is not mutated.
 *
 * Callers should reject an invalid range up front with
 * {@link isValidDateRange}; applied to a `start`-after-`end` range this filter
 * yields no rows.
 *
 * @typeParam T - The row type.
 * @param rows - The records to filter.
 * @param getDate - Selects the row's date, or `null` when it has none.
 * @param range - The inclusive date range.
 * @returns The subset of `rows` whose date lies within `[start, end]`.
 */
export function filterByDateRange<T>(
  rows: readonly T[],
  getDate: (row: T) => Date | null,
  range: DateRange,
): T[] {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return rows.filter((row) => {
    const date = getDate(row);
    if (date === null) {
      return false;
    }
    const ms = date.getTime();
    return ms >= startMs && ms <= endMs;
  });
}
