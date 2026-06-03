import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { detectResponseTimeAnomaly } from './signals.js';
import type { MonthlySummaryRecord } from './types/index.js';

/**
 * Property 39: Response-time anomalies trigger above the 60000 ms threshold.
 *
 * Design statement: "For any user whose avg_duration_ms exceeds 60 000 ms,
 * the Signal Engine emits a response_time_anomaly signal with severity
 * informational; at exactly 60 000 or below, no such signal is emitted."
 *
 * Validates: Requirements 17.4
 */

const THRESHOLD_MS = 60_000;

/** Build a minimal MonthlySummaryRecord with only the fields the detection rule inspects. */
function makeSummary(overrides: Partial<MonthlySummaryRecord> = {}): MonthlySummaryRecord {
  return {
    billing_month: '2026-05',
    user_id: 'user-1',
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: new Decimal('1000'),
    used_usd: new Decimal('500'),
    remaining_monthly_limit_usd: new Decimal('500'),
    usage_percent: 50,
    request_count: 100,
    api_key_count: 2,
    active_days: 10,
    input_tokens: 1000,
    output_tokens: 500,
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
    avg_duration_ms: 3000,
    avg_first_token_ms: null,
    first_request_at: null,
    last_request_at: null,
    ...overrides,
  };
}

/** Arbitrary for avg_duration_ms values strictly above the 60000 ms threshold. */
const aboveThresholdArb = fc.double({
  min: 60_000.001,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Arbitrary for avg_duration_ms values at or below the 60000 ms threshold (non-negative). */
const atOrBelowThresholdArb = fc.double({
  min: 0,
  max: 60_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Arbitrary user_id strings (non-empty). */
const userIdArb = fc.string({ minLength: 1, maxLength: 8 }).map((s) => `user-${s}`);

describe('detectResponseTimeAnomaly (Property 39: threshold trigger)', () => {
  it('emits a response_time_anomaly signal when avg_duration_ms strictly exceeds 60000', () => {
    fc.assert(
      fc.property(aboveThresholdArb, userIdArb, (avgDuration, userId) => {
        const summaries = [makeSummary({ avg_duration_ms: avgDuration, user_id: userId })];
        const signals = detectResponseTimeAnomaly(summaries);

        // Must emit exactly one signal for this user.
        expect(signals).toHaveLength(1);
        expect(signals[0].group).toBe('response_time_anomaly');
        expect(signals[0].severity).toBe('informational');
        expect(signals[0].target.page).toBe('user-analysis');
        expect(signals[0].target.entityId).toBe(userId);
        expect(signals[0].read).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('does NOT emit a signal when avg_duration_ms is exactly 60000 or below', () => {
    fc.assert(
      fc.property(atOrBelowThresholdArb, userIdArb, (avgDuration, userId) => {
        const summaries = [makeSummary({ avg_duration_ms: avgDuration, user_id: userId })];
        const signals = detectResponseTimeAnomaly(summaries);

        // No signal should be emitted at or below the threshold.
        expect(signals).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('emits one signal per user above threshold in a mixed set', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            above: fc.boolean(),
            duration: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (entries) => {
          const summaries = entries.map((entry, i) => {
            // If marked above, ensure it's above threshold; otherwise at or below.
            const avgDuration = entry.above
              ? THRESHOLD_MS + 1 + Math.abs(entry.duration % 900_000)
              : entry.duration <= THRESHOLD_MS
                ? entry.duration
                : THRESHOLD_MS;
            return makeSummary({
              user_id: `user-${i}`,
              avg_duration_ms: avgDuration,
            });
          });

          const signals = detectResponseTimeAnomaly(summaries);

          // Count how many summaries are actually above threshold.
          const expectedCount = summaries.filter(
            (s) => s.avg_duration_ms !== null && s.avg_duration_ms > THRESHOLD_MS,
          ).length;

          expect(signals).toHaveLength(expectedCount);

          // Every emitted signal has the correct group and severity.
          for (const signal of signals) {
            expect(signal.group).toBe('response_time_anomaly');
            expect(signal.severity).toBe('informational');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('emits no signals when avg_duration_ms is null', () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        const summaries = [makeSummary({ avg_duration_ms: null, user_id: userId })];
        const signals = detectResponseTimeAnomaly(summaries);
        expect(signals).toHaveLength(0);
      }),
      { numRuns: 50 },
    );
  });
});
