import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';

import { detectSignals, type DetectSignalsInput } from './signals.js';
import type {
  DailyUsageRecord,
  MonthlySummaryRecord,
  SignalGroup,
  Severity,
} from './types/index.js';

/**
 * Property 41: Every signal carries a group and severity determined by its rule.
 *
 * For any detection input, every produced signal is assigned the group of the
 * rule that produced it (high-spend, low-balance, API key anomaly,
 * response-time anomaly, or risk hint) and a severity of informational,
 * warning, or critical fixed by that rule.
 *
 * **Validates: Requirements 16.2, 17.6**
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_GROUPS: readonly SignalGroup[] = [
  'high_spend',
  'low_balance',
  'api_key_anomaly',
  'response_time_anomaly',
  'risk_hint',
] as const;

const VALID_SEVERITIES: readonly Severity[] = [
  'informational',
  'warning',
  'critical',
] as const;

/** The fixed group → severity mapping documented in the design. */
const GROUP_SEVERITY_MAP: Record<SignalGroup, Severity> = {
  high_spend: 'warning',
  low_balance: 'critical',
  api_key_anomaly: 'warning',
  response_time_anomaly: 'informational',
  risk_hint: 'critical',
};

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a positive Decimal representing a monthly budget limit. */
const arbPositiveDecimal = fc
  .integer({ min: 100, max: 100_000 })
  .map((n) => new Decimal(n));

/** Generate a non-negative Decimal for spend or balance fields. */
const arbNonNegativeDecimal = fc
  .integer({ min: 0, max: 50_000 })
  .map((n) => new Decimal(n));

/** Generate a valid user ID. */
const arbUserId = fc.stringMatching(/^user-[a-z0-9]{1,8}$/);

/** Generate a valid API key ID. */
const arbKeyId = fc.stringMatching(/^key-[a-z0-9]{1,8}$/);

/** Generate a usage_date within a single billing month. */
const arbUsageDate = fc
  .integer({ min: 1, max: 28 })
  .map((day) => new Date(Date.UTC(2026, 4, day))); // May 2026

/**
 * Generate a MonthlySummaryRecord with values that may trigger low-balance
 * and/or response-time anomaly signals.
 */
const arbSummary: fc.Arbitrary<MonthlySummaryRecord> = fc
  .record({
    userId: arbUserId,
    limitUsd: arbPositiveDecimal,
    remainingFraction: fc.double({ min: 0, max: 1, noNaN: true }),
    avgDurationMs: fc.oneof(
      fc.constant(null),
      fc.integer({ min: 0, max: 200_000 }),
    ),
  })
  .map(({ userId, limitUsd, remainingFraction, avgDurationMs }) => ({
    billing_month: '2026-05',
    user_id: userId,
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: limitUsd,
    used_usd: limitUsd.mul(1 - remainingFraction),
    remaining_monthly_limit_usd: limitUsd.mul(remainingFraction),
    usage_percent: (1 - remainingFraction) * 100,
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
    avg_duration_ms: avgDurationMs,
    avg_first_token_ms: null,
    first_request_at: null,
    last_request_at: null,
  }));

/**
 * Generate a DailyUsageRecord with spend that may exceed 20% of a limit,
 * potentially triggering high_spend and risk_hint signals.
 */
const arbDaily = (userIds: string[]): fc.Arbitrary<DailyUsageRecord> =>
  fc
    .record({
      userId: fc.constantFrom(...(userIds.length > 0 ? userIds : ['user-default'])),
      date: arbUsageDate,
      spendUsd: arbNonNegativeDecimal,
    })
    .map(({ userId, date, spendUsd }) => ({
      billing_month: '2026-05',
      usage_date: date,
      user_id: userId,
      email: null,
      username: null,
      request_count: 10,
      used_usd: spendUsd,
      input_tokens: 100,
      output_tokens: 50,
      cache_read_tokens: null,
      image_output_tokens: null,
      avg_duration_ms: 2000,
    }));

/**
 * Generate keyDailyRequestCounts map with values that may trigger API key
 * anomaly signals (some days spike above 3× average).
 */
const arbKeyDailyCounts: fc.Arbitrary<Map<string, number[]>> = fc
  .array(
    fc.tuple(
      arbKeyId,
      fc.array(fc.integer({ min: 0, max: 500 }), { minLength: 1, maxLength: 30 }),
    ),
    { minLength: 0, maxLength: 5 },
  )
  .map((entries) => new Map(entries));

/**
 * Generate a complete DetectSignalsInput that exercises all rule paths.
 */
const arbDetectSignalsInput: fc.Arbitrary<DetectSignalsInput> = arbSummary
  .chain((summary) =>
    fc.tuple(
      fc.array(arbSummary, { minLength: 0, maxLength: 5 }).map((extras) => [summary, ...extras]),
      fc.array(arbDaily([summary.user_id]), { minLength: 0, maxLength: 15 }),
      arbKeyDailyCounts,
    ),
  )
  .map(([summaries, daily, keyDailyRequestCounts]) => ({
    summaries,
    daily,
    keyDailyRequestCounts,
  }));

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property 41: Every signal carries a group and severity determined by its rule', () => {
  it('every signal has a valid group (one of the five signal categories)', () => {
    fc.assert(
      fc.property(arbDetectSignalsInput, (input) => {
        const signals = detectSignals(input);
        for (const signal of signals) {
          expect(VALID_GROUPS).toContain(signal.group);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('every signal has a valid severity (informational, warning, or critical)', () => {
    fc.assert(
      fc.property(arbDetectSignalsInput, (input) => {
        const signals = detectSignals(input);
        for (const signal of signals) {
          expect(VALID_SEVERITIES).toContain(signal.severity);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the group→severity mapping is fixed per rule', () => {
    fc.assert(
      fc.property(arbDetectSignalsInput, (input) => {
        const signals = detectSignals(input);
        for (const signal of signals) {
          const expectedSeverity = GROUP_SEVERITY_MAP[signal.group];
          expect(signal.severity).toBe(expectedSeverity);
        }
      }),
      { numRuns: 200 },
    );
  });
});
