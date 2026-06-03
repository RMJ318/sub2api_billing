import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { matchesUserSearch, searchByText } from './query-helpers.js';

/**
 * Property 21: Case-insensitive search returns exactly the matching rows.
 *
 * For any set of rows with username/email fields and any search query string,
 * `searchByText` returns exactly those rows whose username or email contains
 * the search string as a case-insensitive substring. Matching "ABC" finds
 * "abc" rows; all matching rows are returned (no false negatives) and no
 * non-matching rows are returned (no false positives).
 *
 * Validates: Requirements 7.3
 */
describe('Property 21: Case-insensitive search returns exactly the matching rows', () => {
  /** A nullable string field (username or email). */
  const field = fc.oneof(
    fc.constant<string | null>(null),
    fc.string({ minLength: 0, maxLength: 30 }),
  );

  /** A row with username and email fields. */
  const rowArb = fc.record({
    username: field,
    email: field,
  });

  /** A list of rows to search over. */
  const rowsArb = fc.array(rowArb, { minLength: 0, maxLength: 20 });

  /** A search query (any string, including empty). */
  const queryArb = fc.string({ minLength: 0, maxLength: 10 });

  /**
   * Helper: determine if a row matches by computing the case-insensitive
   * substring check independently of the implementation under test.
   */
  function expectedMatch(
    row: { username: string | null; email: string | null },
    query: string,
  ): boolean {
    const lq = query.toLowerCase();
    const usernameMatch = row.username !== null && row.username.toLowerCase().includes(lq);
    const emailMatch = row.email !== null && row.email.toLowerCase().includes(lq);
    return usernameMatch || emailMatch;
  }

  it('search is case-insensitive: matching "ABC" finds "abc" rows', () => {
    // Generate a row that definitely contains the query (under some case) and
    // verify the search matches it regardless of case differences.
    const alphaStr = fc.stringMatching(/^[a-z]+$/, { minLength: 1, maxLength: 8 });

    fc.assert(
      fc.property(alphaStr, (substr) => {
        // Randomly case-transform the substring for the row
        const upper = substr.toUpperCase();
        const row = { username: upper, email: null };
        // Search with the original lowercase substring
        expect(matchesUserSearch(row, substr)).toBe(true);
        // Search with the uppercase substring on a lowercase row
        const rowLower = { username: substr, email: null };
        expect(matchesUserSearch(rowLower, upper)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns only rows whose username or email contains the search substring (no false positives)', () => {
    fc.assert(
      fc.property(rowsArb, queryArb, (rows, query) => {
        const result = searchByText(rows, query);
        // Every returned row must actually match
        for (const row of result) {
          expect(expectedMatch(row, query)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('returns all matching rows (no false negatives)', () => {
    fc.assert(
      fc.property(rowsArb, queryArb, (rows, query) => {
        const result = searchByText(rows, query);
        // Every row that should match must appear in the result
        const expectedCount = rows.filter((r) => expectedMatch(r, query)).length;
        expect(result.length).toBe(expectedCount);
      }),
      { numRuns: 100 },
    );
  });

  it('searchByText result equals exactly the set of matching rows (no false positives, no false negatives)', () => {
    fc.assert(
      fc.property(rowsArb, queryArb, (rows, query) => {
        const result = searchByText(rows, query);
        const expected = rows.filter((r) => expectedMatch(r, query));
        expect(result).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('preserves original order of matching rows', () => {
    fc.assert(
      fc.property(rowsArb, queryArb, (rows, query) => {
        const result = searchByText(rows, query);
        // The result should be a subsequence of the original rows array
        let lastIdx = -1;
        for (const row of result) {
          const idx = rows.indexOf(row, lastIdx + 1);
          expect(idx).toBeGreaterThan(lastIdx);
          lastIdx = idx;
        }
      }),
      { numRuns: 100 },
    );
  });
});
