import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { computeDashboardKpis } from './index.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * Property 12: Active user count counts distinct active users.
 *
 * For any set of Monthly_Summary_Records, the active user count equals the
 * number of distinct `user_id` values whose `request_count` is greater than
 * or equal to 1. Users appearing multiple times are counted only once. Empty
 * record sets produce an active user count of 0.
 *
 * Validates: Requirements 4.3
 */
describe('Property 12: Active user count counts distinct active users', () => {
  // A user_id drawn from a small domain so duplicates occur frequently,
  // exercising the distinctness logic.
  const userId: fc.Arbitrary<string> = fc.constantFrom(
    'user-1', 'user-2', 'user-3', 'user-4', 'user-5',
    'user-6', 'user-7', 'user-8',
  );

  // request_count is either null (treated as 0) or a non-negative integer.
  // We include 0 to exercise the "active means >= 1" boundary.
  const requestCount: fc.Arbitrary<number | null> = fc.oneof(
    fc.constant(null),
    fc.constant(0),
    fc.integer({ min: 1, max: 10_000 }),
  );

  /** Build a MonthlySummaryRecord with the given user_id and request_count. */
  function makeRecord(uid: string, reqCount: number | null): MonthlySummaryRecord {
    return {
      billing_month: '2026-05',
      user_id: uid,
      email: null,
      username: null,
      wechat: null,
      notes: null,
      role: null,
      status: null,
      current_balance_usd: null,
      monthly_limit_usd: null,
      used_usd: null,
      remaining_monthly_limit_usd: null,
      usage_percent: null,
      request_count: reqCount,
      api_key_count: null,
      active_days: null,
      input_tokens: null,
      output_tokens: null,
      cache_creation_tokens: null,
      cache_read_tokens: null,
      image_output_tokens: null,
      image_count: null,
      input_cost_usd: null,
      output_cost_usd: null,
      cache_creation_cost_usd: null,
      cache_read_cost_usd: null,
      image_output_cost_usd: null,
      actual_cost_usd: null,
      avg_duration_ms: null,
      avg_first_token_ms: null,
      first_request_at: null,
      last_request_at: null,
    };
  }

  // Generate arrays of records with small-domain user_ids to produce duplicates.
  const recordArb = fc.record({ userId, requestCount });
  const recordsArb = fc.array(recordArb, { maxLength: 50 });

  it('equals the count of distinct user_ids with request_count >= 1', () => {
    fc.assert(
      fc.property(recordsArb, (entries) => {
        const records = entries.map((e) => makeRecord(e.userId, e.requestCount));
        const kpis = computeDashboardKpis(records);

        // Reference: collect distinct user_ids that have at least one record
        // with request_count >= 1.
        const activeUsers = new Set<string>();
        for (const e of entries) {
          if ((e.requestCount ?? 0) >= 1) {
            activeUsers.add(e.userId);
          }
        }

        expect(kpis.activeUserCount).toBe(activeUsers.size);
      }),
      { numRuns: 200 },
    );
  });

  it('users appearing multiple times are counted only once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 1, max: 10_000 }),
        (duplicateCount, reqCount) => {
          // Create multiple records for the same user, all active.
          const uid = 'duplicate-user';
          const records = Array.from({ length: duplicateCount }, () =>
            makeRecord(uid, reqCount),
          );
          const kpis = computeDashboardKpis(records);
          // Regardless of how many times the user appears, count should be 1.
          expect(kpis.activeUserCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty record sets produce an active user count of 0', () => {
    const kpis = computeDashboardKpis([]);
    expect(kpis.activeUserCount).toBe(0);
  });
});
