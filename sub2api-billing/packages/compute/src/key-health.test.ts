/**
 * Unit tests for key health classifiers (Requirements 12.4, 12.5, 12.6).
 */
import { describe, it, expect } from 'vitest';
import type { KeyUsageRecord } from './types/records.js';
import Decimal from 'decimal.js';
import {
  longUnusedKeys,
  highFrequencyKeys,
  abnormalGrowthKeys,
  classifyKeyHealth,
  billingMonthEnd,
} from './key-health.js';

/** Helper to create a minimal KeyUsageRecord for testing. */
function makeKey(overrides: Partial<KeyUsageRecord> & { api_key_id: string }): KeyUsageRecord {
  return {
    billing_month: '2026-05',
    user_id: 'user-1',
    email: null,
    username: null,
    api_key_name: null,
    api_key_status: null,
    api_key_deleted: null,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    first_request_at: null,
    last_request_at: null,
    ...overrides,
  };
}

describe('billingMonthEnd', () => {
  it('returns the last instant of the given month', () => {
    // May 2026 has 31 days → last instant is 2026-05-31T23:59:59.999Z
    const end = billingMonthEnd('2026-05');
    expect(end.getUTCFullYear()).toBe(2026);
    expect(end.getUTCMonth()).toBe(4); // May = 4 (0-indexed)
    expect(end.getUTCDate()).toBe(31);
    expect(end.getUTCHours()).toBe(23);
    expect(end.getUTCMinutes()).toBe(59);
    expect(end.getUTCSeconds()).toBe(59);
    expect(end.getUTCMilliseconds()).toBe(999);
  });

  it('handles December correctly (rolls year)', () => {
    const end = billingMonthEnd('2026-12');
    expect(end.getUTCFullYear()).toBe(2026);
    expect(end.getUTCMonth()).toBe(11); // Dec = 11
    expect(end.getUTCDate()).toBe(31);
  });

  it('throws on invalid input', () => {
    expect(() => billingMonthEnd('invalid')).toThrow();
    expect(() => billingMonthEnd('')).toThrow();
    expect(() => billingMonthEnd('2026')).toThrow();
  });
});

describe('longUnusedKeys', () => {
  it('classifies keys idle more than 14 days before month end as long-unused', () => {
    // Month end for 2026-05 is May 31. 14 days before = May 17.
    // A key last used on May 10 (> 14 days idle) should be flagged.
    const idleKey = makeKey({
      api_key_id: 'key-idle',
      last_request_at: new Date(Date.UTC(2026, 4, 10)), // May 10
    });
    const recentKey = makeKey({
      api_key_id: 'key-recent',
      last_request_at: new Date(Date.UTC(2026, 4, 20)), // May 20
    });
    const nullKey = makeKey({
      api_key_id: 'key-null',
      last_request_at: null,
    });

    const result = longUnusedKeys([idleKey, recentKey, nullKey], '2026-05');

    expect(result).toHaveLength(1);
    expect(result[0].api_key_id).toBe('key-idle');
  });

  it('excludes keys with null last_request_at', () => {
    const nullKey = makeKey({ api_key_id: 'key-null', last_request_at: null });
    const result = longUnusedKeys([nullKey], '2026-05');
    expect(result).toHaveLength(0);
  });

  it('uses the threshold correctly at the boundary', () => {
    // Month end for 2026-05 = May 31 23:59:59.999 UTC
    // Threshold = monthEnd - 14 days = May 17 23:59:59.999 UTC
    // A key at exactly that time (not strictly less) should NOT be flagged.
    const monthEnd = billingMonthEnd('2026-05');
    const threshold = new Date(monthEnd.getTime() - 14 * 24 * 60 * 60 * 1000);

    const atThreshold = makeKey({
      api_key_id: 'key-at-threshold',
      last_request_at: threshold,
    });
    const justBefore = makeKey({
      api_key_id: 'key-before-threshold',
      last_request_at: new Date(threshold.getTime() - 1),
    });

    const result = longUnusedKeys([atThreshold, justBefore], '2026-05');
    expect(result).toHaveLength(1);
    expect(result[0].api_key_id).toBe('key-before-threshold');
  });
});

describe('highFrequencyKeys', () => {
  it('returns top N keys by request count', () => {
    const keys = [
      makeKey({ api_key_id: 'key-a', request_count: 100 }),
      makeKey({ api_key_id: 'key-b', request_count: 500 }),
      makeKey({ api_key_id: 'key-c', request_count: 200 }),
    ];

    const result = highFrequencyKeys(keys, 2);
    expect(result).toHaveLength(2);
    expect(result[0].api_key_id).toBe('key-b');
    expect(result[1].api_key_id).toBe('key-c');
  });

  it('returns all keys when fewer than N', () => {
    const keys = [makeKey({ api_key_id: 'key-a', request_count: 10 })];
    const result = highFrequencyKeys(keys, 5);
    expect(result).toHaveLength(1);
  });

  it('treats null request_count as 0', () => {
    const keys = [
      makeKey({ api_key_id: 'key-a', request_count: null }),
      makeKey({ api_key_id: 'key-b', request_count: 1 }),
    ];
    const result = highFrequencyKeys(keys, 1);
    expect(result[0].api_key_id).toBe('key-b');
  });
});

describe('abnormalGrowthKeys', () => {
  it('detects keys with >= 200% growth', () => {
    const preceding = [makeKey({ api_key_id: 'key-a', request_count: 10 })];
    const current = [makeKey({ api_key_id: 'key-a', request_count: 30 })]; // 200% growth

    const result = abnormalGrowthKeys(current, preceding);
    expect(result).toHaveLength(1);
    expect(result[0].key.api_key_id).toBe('key-a');
    expect(result[0].growthPercent).toBe(200);
  });

  it('excludes keys below 200% threshold', () => {
    const preceding = [makeKey({ api_key_id: 'key-a', request_count: 10 })];
    const current = [makeKey({ api_key_id: 'key-a', request_count: 29 })]; // 190%

    const result = abnormalGrowthKeys(current, preceding);
    expect(result).toHaveLength(0);
  });

  it('excludes keys with zero preceding count', () => {
    const preceding = [makeKey({ api_key_id: 'key-a', request_count: 0 })];
    const current = [makeKey({ api_key_id: 'key-a', request_count: 100 })];

    const result = abnormalGrowthKeys(current, preceding);
    expect(result).toHaveLength(0);
  });

  it('excludes keys not present in preceding month', () => {
    const preceding: KeyUsageRecord[] = [];
    const current = [makeKey({ api_key_id: 'key-new', request_count: 100 })];

    const result = abnormalGrowthKeys(current, preceding);
    expect(result).toHaveLength(0);
  });

  it('aggregates multiple records for the same key', () => {
    const preceding = [makeKey({ api_key_id: 'key-a', request_count: 10 })];
    const current = [
      makeKey({ api_key_id: 'key-a', request_count: 20 }),
      makeKey({ api_key_id: 'key-a', request_count: 15 }),
    ];
    // Total current = 35, growth = (35-10)/10*100 = 250%

    const result = abnormalGrowthKeys(current, preceding);
    expect(result).toHaveLength(1);
    expect(result[0].currentRequestCount).toBe(35);
    expect(result[0].growthPercent).toBe(250);
  });
});

describe('classifyKeyHealth', () => {
  it('bundles all three classifiers', () => {
    const keys = [
      makeKey({
        api_key_id: 'key-idle',
        last_request_at: new Date(Date.UTC(2026, 4, 1)), // May 1
        request_count: 5,
      }),
      makeKey({
        api_key_id: 'key-hot',
        last_request_at: new Date(Date.UTC(2026, 4, 30)),
        request_count: 500,
      }),
    ];
    const precedingKeys = [
      makeKey({ api_key_id: 'key-hot', request_count: 50, billing_month: '2026-04' }),
    ];

    const health = classifyKeyHealth({
      keys,
      billingMonth: '2026-05',
      precedingKeys,
    });

    // key-idle is long-unused (May 1 is > 14 days before May 31)
    expect(health.longUnused.map((k) => k.api_key_id)).toContain('key-idle');
    // key-hot is high-frequency (500 requests)
    expect(health.highFrequency[0].api_key_id).toBe('key-hot');
    // key-hot grew 900% (500 vs 50)
    expect(health.abnormalGrowth).toHaveLength(1);
    expect(health.abnormalGrowth[0].key.api_key_id).toBe('key-hot');
  });

  it('returns empty abnormalGrowth when no preceding keys', () => {
    const keys = [makeKey({ api_key_id: 'key-a', request_count: 100 })];
    const health = classifyKeyHealth({ keys, billingMonth: '2026-05' });
    expect(health.abnormalGrowth).toHaveLength(0);
  });
});
