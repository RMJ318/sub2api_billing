import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  compareValues,
  stableSortBy,
  matchesUserSearch,
  searchByText,
  isValidDateRange,
  filterByDateRange,
} from './query-helpers.js';

describe('stableSortBy', () => {
  it('sorts numbers ascending and descending', () => {
    const rows = [{ v: 3 }, { v: 1 }, { v: 2 }];
    expect(stableSortBy(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([1, 2, 3]);
    expect(stableSortBy(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([3, 2, 1]);
  });

  it('defaults to ascending order', () => {
    const rows = [{ v: 2 }, { v: 1 }];
    expect(stableSortBy(rows, (r) => r.v).map((r) => r.v)).toEqual([1, 2]);
  });

  it('is stable for equal keys in both directions', () => {
    const rows = [
      { v: 1, id: 'a' },
      { v: 1, id: 'b' },
      { v: 1, id: 'c' },
    ];
    expect(stableSortBy(rows, (r) => r.v, 'asc').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(stableSortBy(rows, (r) => r.v, 'desc').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('compares Decimal money columns by magnitude', () => {
    const rows = [
      { spend: new Decimal('10.5') },
      { spend: new Decimal('2.25') },
      { spend: new Decimal('100.000001') },
    ];
    expect(stableSortBy(rows, (r) => r.spend, 'desc').map((r) => r.spend.toString())).toEqual([
      '100.000001',
      '10.5',
      '2.25',
    ]);
  });

  it('orders null/undefined before present values ascending', () => {
    const rows = [{ v: 2 }, { v: null }, { v: 1 }];
    expect(stableSortBy(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([null, 1, 2]);
  });

  it('does not mutate the input array', () => {
    const rows = [{ v: 3 }, { v: 1 }];
    const snapshot = [...rows];
    stableSortBy(rows, (r) => r.v, 'asc');
    expect(rows).toEqual(snapshot);
  });
});

describe('compareValues', () => {
  it('orders Date values chronologically', () => {
    const a = new Date('2026-04-01T00:00:00Z');
    const b = new Date('2026-04-02T00:00:00Z');
    expect(compareValues(a, b)).toBeLessThan(0);
    expect(compareValues(b, a)).toBeGreaterThan(0);
    expect(compareValues(a, a)).toBe(0);
  });

  it('orders false before true', () => {
    expect(compareValues(false, true)).toBeLessThan(0);
  });
});

describe('matchesUserSearch / searchByText', () => {
  const rows = [
    { username: 'Alice', email: 'alice@example.com' },
    { username: null, email: 'BOB@example.com' },
    { username: 'carol', email: null },
  ];

  it('matches case-insensitively on username', () => {
    expect(matchesUserSearch(rows[0]!, 'ALI')).toBe(true);
  });

  it('matches case-insensitively on email when username is null', () => {
    expect(matchesUserSearch(rows[1]!, 'bob')).toBe(true);
  });

  it('returns exactly the matching rows', () => {
    expect(searchByText(rows, 'example.com')).toHaveLength(2);
    expect(searchByText(rows, 'carol')).toEqual([rows[2]]);
    expect(searchByText(rows, 'zzz')).toEqual([]);
  });

  it('treats an empty query as matching any row with a present field', () => {
    expect(searchByText(rows, '')).toHaveLength(3);
  });
});

describe('isValidDateRange', () => {
  it('accepts start before or equal to end', () => {
    const start = new Date('2026-04-01T00:00:00Z');
    const end = new Date('2026-04-30T00:00:00Z');
    expect(isValidDateRange({ start, end })).toBe(true);
    expect(isValidDateRange({ start, end: start })).toBe(true);
  });

  it('rejects start after end', () => {
    const start = new Date('2026-04-30T00:00:00Z');
    const end = new Date('2026-04-01T00:00:00Z');
    expect(isValidDateRange({ start, end })).toBe(false);
  });
});

describe('filterByDateRange', () => {
  const mk = (iso: string | null) => ({ date: iso === null ? null : new Date(iso) });
  const rows = [
    mk('2026-04-01T00:00:00Z'),
    mk('2026-04-15T12:00:00Z'),
    mk('2026-04-30T23:59:59Z'),
    mk('2026-05-01T00:00:00Z'),
    mk(null),
  ];
  const range = {
    start: new Date('2026-04-01T00:00:00Z'),
    end: new Date('2026-04-30T23:59:59Z'),
  };

  it('includes records on both inclusive bounds and excludes outside/null', () => {
    const result = filterByDateRange(rows, (r) => r.date, range);
    expect(result).toHaveLength(3);
    expect(result).toEqual([rows[0], rows[1], rows[2]]);
  });
});
