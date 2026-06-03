import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { topPerformers } from './insights.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * Property 34: Top-performer rankings are produced when data is non-trivial and ordered.
 *
 * For any set of Monthly_Summary_Records in which at least one user has non-zero
 * Spend, request count, or token count, the Insight_Engine produces top-performer
 * rankings by Spend, request count, and token count, each ordered in descending
 * order of its metric.
 *
 * **Validates: Requirements 15.1**
 */
describe('Property 34: Top-performer rankings are produced when data is non-trivial and ordered', () => {
  // ─── Generators ──────────────────────────────────────────────────────────────

  const userId: fc.Arbitrary<string> = fc.constantFrom(
    'user-1', 'user-2', 'user-3', 'user-4', 'user-5',
    'user-6', 'user-7', 'user-8',
  );

  const usernameOrNull: fc.Arbitrary<string | null> = fc.oneof(
    fc.constant(null),
    fc.constantFrom('alice', 'bob', 'carol', 'dave', 'eve'),
  );

  const emailOrNull: fc.Arbitrary<string | null> = fc.oneof(
    fc.constant(null),
    fc.constantFrom('a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'),
  );

  /** Non-negative spend value as a Decimal (null treated as zero by the function). */
  const spendArb: fc.Arbitrary<Decimal | null> = fc.oneof(
    fc.constant(null),
    fc.integer({ min: 0, max: 10_000 }).map((v) => new Decimal(v)),
  );

  /** Non-negative request count or null. */
  const requestCountArb: fc.Arbitrary<number | null> = fc.oneof(
    fc.constant(null),
    fc.integer({ min: 0, max: 50_000 }),
  );

  /** Non-negative token count or null (each of the five token fields). */
  const tokenFieldArb: fc.Arbitrary<number | null> = fc.oneof(
    fc.constant(null),
    fc.integer({ min: 0, max: 100_000 }),
  );

  /** Build a MonthlySummaryRecord with generated values. */
  function makeRecord(
    uid: string,
    username: string | null,
    email: string | null,
    spend: Decimal | null,
    reqCount: number | null,
    inputTokens: number | null,
    outputTokens: number | null,
    cacheCreationTokens: number | null,
    cacheReadTokens: number | null,
    imageOutputTokens: number | null,
  ): MonthlySummaryRecord {
    return {
      billing_month: '2026-05',
      user_id: uid,
      email,
      username,
      wechat: null,
      notes: null,
      role: null,
      status: null,
      current_balance_usd: null,
      monthly_limit_usd: null,
      used_usd: spend,
      remaining_monthly_limit_usd: null,
      usage_percent: null,
      request_count: reqCount,
      api_key_count: null,
      active_days: null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_tokens: cacheCreationTokens,
      cache_read_tokens: cacheReadTokens,
      image_output_tokens: imageOutputTokens,
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

  /** Total token count for a record (same formula as implementation). */
  function totalTokens(r: MonthlySummaryRecord): number {
    return (
      (r.input_tokens ?? 0) +
      (r.output_tokens ?? 0) +
      (r.cache_creation_tokens ?? 0) +
      (r.cache_read_tokens ?? 0) +
      (r.image_output_tokens ?? 0)
    );
  }

  const recordEntryArb = fc.record({
    userId,
    username: usernameOrNull,
    email: emailOrNull,
    spend: spendArb,
    requestCount: requestCountArb,
    inputTokens: tokenFieldArb,
    outputTokens: tokenFieldArb,
    cacheCreationTokens: tokenFieldArb,
    cacheReadTokens: tokenFieldArb,
    imageOutputTokens: tokenFieldArb,
  });

  /** Generate a non-empty array of record entries with at least one non-trivial value. */
  const nonTrivialRecordsArb = fc
    .array(recordEntryArb, { minLength: 1, maxLength: 30 })
    .filter((entries) => {
      // At least one user must have non-zero for at least one metric
      return entries.some((e) => {
        const spend = e.spend ?? new Decimal(0);
        const req = e.requestCount ?? 0;
        const tok =
          (e.inputTokens ?? 0) +
          (e.outputTokens ?? 0) +
          (e.cacheCreationTokens ?? 0) +
          (e.cacheReadTokens ?? 0) +
          (e.imageOutputTokens ?? 0);
        return !spend.isZero() || req > 0 || tok > 0;
      });
    });

  /** Generate records where all metrics are zero for all users. */
  const allZeroRecordsArb = fc
    .array(
      fc.record({ userId, username: usernameOrNull, email: emailOrNull }),
      { minLength: 1, maxLength: 20 },
    )
    .map((entries) =>
      entries.map((e) => makeRecord(e.userId, e.username, e.email, new Decimal(0), 0, 0, 0, 0, 0, 0)),
    );

  // ─── Property Tests ──────────────────────────────────────────────────────────

  it('produces non-null rankings when at least one user has non-zero values', () => {
    fc.assert(
      fc.property(nonTrivialRecordsArb, (entries) => {
        const records = entries.map((e) =>
          makeRecord(
            e.userId, e.username, e.email, e.spend, e.requestCount,
            e.inputTokens, e.outputTokens, e.cacheCreationTokens,
            e.cacheReadTokens, e.imageOutputTokens,
          ),
        );

        const result = topPerformers(records);
        expect(result).not.toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it('the top user by spend is the one with the highest spend value', () => {
    fc.assert(
      fc.property(nonTrivialRecordsArb, (entries) => {
        const records = entries.map((e) =>
          makeRecord(
            e.userId, e.username, e.email, e.spend, e.requestCount,
            e.inputTokens, e.outputTokens, e.cacheCreationTokens,
            e.cacheReadTokens, e.imageOutputTokens,
          ),
        );

        const result = topPerformers(records);
        if (!result) return; // already tested above

        // Compute the expected max spend across all records
        let maxSpend = new Decimal(0);
        for (const r of records) {
          const spend = r.used_usd ?? new Decimal(0);
          if (spend.gt(maxSpend)) {
            maxSpend = spend;
          }
        }

        if (maxSpend.isZero()) {
          // When all-zero spend, bySpend should be null
          expect(result.bySpend).toBeNull();
        } else {
          expect(result.bySpend).not.toBeNull();
          expect(result.bySpend!.value).toBe(maxSpend.toString());
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the top user by requests is the one with the highest request count', () => {
    fc.assert(
      fc.property(nonTrivialRecordsArb, (entries) => {
        const records = entries.map((e) =>
          makeRecord(
            e.userId, e.username, e.email, e.spend, e.requestCount,
            e.inputTokens, e.outputTokens, e.cacheCreationTokens,
            e.cacheReadTokens, e.imageOutputTokens,
          ),
        );

        const result = topPerformers(records);
        if (!result) return;

        // Compute the expected max request count
        let maxReq = 0;
        for (const r of records) {
          const req = r.request_count ?? 0;
          if (req > maxReq) {
            maxReq = req;
          }
        }

        if (maxReq === 0) {
          expect(result.byRequests).toBeNull();
        } else {
          expect(result.byRequests).not.toBeNull();
          expect(result.byRequests!.value).toBe(maxReq);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the top user by tokens is the one with the highest total token count', () => {
    fc.assert(
      fc.property(nonTrivialRecordsArb, (entries) => {
        const records = entries.map((e) =>
          makeRecord(
            e.userId, e.username, e.email, e.spend, e.requestCount,
            e.inputTokens, e.outputTokens, e.cacheCreationTokens,
            e.cacheReadTokens, e.imageOutputTokens,
          ),
        );

        const result = topPerformers(records);
        if (!result) return;

        // Compute the expected max token count
        let maxTokens = 0;
        for (const r of records) {
          const tok = totalTokens(r);
          if (tok > maxTokens) {
            maxTokens = tok;
          }
        }

        if (maxTokens === 0) {
          expect(result.byTokens).toBeNull();
        } else {
          expect(result.byTokens).not.toBeNull();
          expect(result.byTokens!.value).toBe(maxTokens);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('returns null when all users are zero for all metrics', () => {
    fc.assert(
      fc.property(allZeroRecordsArb, (records) => {
        const result = topPerformers(records);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('each individual metric ranking is null when all users are zero for that specific metric', () => {
    // Generate records where spend is non-zero but requests and tokens are all zero
    const spendOnlyArb = fc
      .array(
        fc.record({ userId, username: usernameOrNull, email: emailOrNull }),
        { minLength: 1, maxLength: 15 },
      )
      .map((entries) =>
        entries.map((e, i) =>
          makeRecord(
            e.userId, e.username, e.email,
            // At least one record has non-zero spend
            i === 0 ? new Decimal(100) : new Decimal(0),
            0, // request_count = 0
            0, 0, 0, 0, 0, // all tokens = 0
          ),
        ),
      );

    fc.assert(
      fc.property(spendOnlyArb, (records) => {
        const result = topPerformers(records);
        expect(result).not.toBeNull();
        // bySpend should be non-null since at least one user has spend
        expect(result!.bySpend).not.toBeNull();
        // byRequests and byTokens should be null since all are zero
        expect(result!.byRequests).toBeNull();
        expect(result!.byTokens).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
