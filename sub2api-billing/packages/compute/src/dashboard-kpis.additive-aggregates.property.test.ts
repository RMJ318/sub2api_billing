import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { computeDashboardKpis } from './index.js';
import type { MonthlySummaryRecord } from './types/records.js';

/**
 * Property 11: Additive aggregates equal the sum of their source field.
 *
 * For any set of Monthly_Summary_Records:
 * - total Spend equals the decimal sum of `used_usd`
 * - total token count equals the sum of the five token fields
 *   (input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens + image_output_tokens)
 * - total request count equals the sum of `request_count`
 * - total API key count equals the sum of `api_key_count`
 *
 * These are all additive aggregates that can be verified by summing the source
 * field. Null fields contribute 0 (the additive identity).
 *
 * Validates: Requirements 4.2, 4.4, 4.5, 4.6, 5.4
 */
describe('Property 11: Additive aggregates equal the sum of their source field', () => {
  // A money value with up to 6 fractional digits, mirroring the real data
  // precision (e.g. `433.930721`). Built from a string so Decimal is exact.
  const moneyArb: fc.Arbitrary<Decimal> = fc
    .record({
      sign: fc.constantFrom('', '-'),
      intPart: fc.integer({ min: 0, max: 99_999 }),
      frac: fc.integer({ min: 0, max: 999_999 }),
    })
    .map(({ sign, intPart, frac }) => new Decimal(`${sign}${intPart}.${String(frac).padStart(6, '0')}`));

  // Non-negative integer for token/count fields, bounded to avoid overflow in
  // summation while still providing a meaningful range.
  const countArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 100_000 });

  // Nullable variants: some records have null fields (empty optional).
  const nullableMoney: fc.Arbitrary<Decimal | null> = fc.oneof(
    { weight: 3, arbitrary: moneyArb },
    { weight: 1, arbitrary: fc.constant(null) },
  );
  const nullableCount: fc.Arbitrary<number | null> = fc.oneof(
    { weight: 3, arbitrary: countArb },
    { weight: 1, arbitrary: fc.constant(null) },
  );

  // Generator for a MonthlySummaryRecord with random additive fields and all
  // other fields set to their minimal valid values.
  const summaryRecordArb: fc.Arbitrary<MonthlySummaryRecord> = fc
    .record({
      user_id: fc.stringMatching(/^u[0-9]{1,4}$/),
      used_usd: nullableMoney,
      request_count: nullableCount,
      api_key_count: nullableCount,
      input_tokens: nullableCount,
      output_tokens: nullableCount,
      cache_creation_tokens: nullableCount,
      cache_read_tokens: nullableCount,
      image_output_tokens: nullableCount,
    })
    .map((fields) => ({
      billing_month: '2026-05',
      user_id: fields.user_id,
      email: null,
      username: null,
      wechat: null,
      notes: null,
      role: null,
      status: null,
      current_balance_usd: null,
      monthly_limit_usd: null,
      used_usd: fields.used_usd,
      remaining_monthly_limit_usd: null,
      usage_percent: null,
      request_count: fields.request_count,
      api_key_count: fields.api_key_count,
      active_days: null,
      input_tokens: fields.input_tokens,
      output_tokens: fields.output_tokens,
      cache_creation_tokens: fields.cache_creation_tokens,
      cache_read_tokens: fields.cache_read_tokens,
      image_output_tokens: fields.image_output_tokens,
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
    }));

  const recordsArb = fc.array(summaryRecordArb, { maxLength: 50 });

  it('total Spend equals the decimal sum of used_usd (Req 4.2)', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const kpis = computeDashboardKpis(records);
        const expectedSpend = records.reduce(
          (acc, r) => acc.plus(r.used_usd ?? new Decimal(0)),
          new Decimal(0),
        );
        expect(kpis.totalSpendUsd.equals(expectedSpend)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('total token count equals the sum of the five token fields (Req 4.4)', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const kpis = computeDashboardKpis(records);
        const expectedTokens = records.reduce(
          (acc, r) =>
            acc +
            (r.input_tokens ?? 0) +
            (r.output_tokens ?? 0) +
            (r.cache_creation_tokens ?? 0) +
            (r.cache_read_tokens ?? 0) +
            (r.image_output_tokens ?? 0),
          0,
        );
        expect(kpis.totalTokenCount).toBe(expectedTokens);
      }),
      { numRuns: 100 },
    );
  });

  it('total request count equals the sum of request_count (Req 4.5)', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const kpis = computeDashboardKpis(records);
        const expectedRequests = records.reduce(
          (acc, r) => acc + (r.request_count ?? 0),
          0,
        );
        expect(kpis.totalRequestCount).toBe(expectedRequests);
      }),
      { numRuns: 100 },
    );
  });

  it('total API key count equals the sum of api_key_count (Req 4.6)', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const kpis = computeDashboardKpis(records);
        const expectedKeys = records.reduce(
          (acc, r) => acc + (r.api_key_count ?? 0),
          0,
        );
        expect(kpis.totalApiKeyCount).toBe(expectedKeys);
      }),
      { numRuns: 100 },
    );
  });
});
