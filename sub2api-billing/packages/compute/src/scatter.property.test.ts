import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { userActivityScatter, modelEfficiencyScatter } from './scatter.js';
import type { MonthlySummaryRecord, ModelUsageRecord } from './types/records.js';
import type { ScatterPoint } from './scatter.js';

/**
 * Property 26: Scatter mapping is one point per entity with correct coordinates.
 *
 * For any set of per-entity records (users or models), the scatter dataset
 * contains exactly one point per entity whose X and Y coordinates equal that
 * entity's defined axis metrics, and the point size is a monotonic
 * non-decreasing function of the entity's total token count.
 *
 * **Validates: Requirements 8.1, 8.2, 11.4**
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Non-negative integer generator for token/count fields. */
const nonNegInt = fc.integer({ min: 0, max: 100_000 });

/** Non-negative Decimal generator for money fields. */
const moneyArb = fc.integer({ min: 0, max: 1_000_000 }).map((n) => new Decimal(n).div(100));

/** String ID generator for user_id / model. */
const idArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

/** Optional nullable string for email/username. */
const optStr = fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null });

/**
 * Generator for a MonthlySummaryRecord relevant to scatter mapping.
 * Uses distinct user_ids to model the one-row-per-user property of the source.
 */
function monthlySummaryArb(): fc.Arbitrary<MonthlySummaryRecord> {
  return fc.record({
    billing_month: fc.constant('2026-05'),
    user_id: idArb,
    email: optStr,
    username: optStr,
    wechat: fc.constant(null),
    notes: fc.constant(null),
    role: fc.constant(null),
    status: fc.constant(null),
    current_balance_usd: fc.constant(null),
    monthly_limit_usd: fc.constant(null),
    used_usd: fc.option(moneyArb, { nil: null }),
    remaining_monthly_limit_usd: fc.constant(null),
    usage_percent: fc.constant(null),
    request_count: fc.option(nonNegInt, { nil: null }),
    api_key_count: fc.constant(null),
    active_days: fc.constant(null),
    input_tokens: fc.option(nonNegInt, { nil: null }),
    output_tokens: fc.option(nonNegInt, { nil: null }),
    cache_creation_tokens: fc.option(nonNegInt, { nil: null }),
    cache_read_tokens: fc.option(nonNegInt, { nil: null }),
    image_output_tokens: fc.option(nonNegInt, { nil: null }),
    image_count: fc.constant(null),
    input_cost_usd: fc.constant(null),
    output_cost_usd: fc.constant(null),
    cache_creation_cost_usd: fc.constant(null),
    cache_read_cost_usd: fc.constant(null),
    image_output_cost_usd: fc.constant(null),
    actual_cost_usd: fc.constant(null),
    avg_duration_ms: fc.constant(null),
    avg_first_token_ms: fc.constant(null),
    first_request_at: fc.constant(null),
    last_request_at: fc.constant(null),
  });
}

/**
 * Generator for a ModelUsageRecord relevant to scatter mapping.
 */
function modelUsageArb(): fc.Arbitrary<ModelUsageRecord> {
  return fc.record({
    billing_month: fc.constant('2026-05'),
    user_id: idArb,
    email: optStr,
    username: optStr,
    model: fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0),
    request_count: fc.option(nonNegInt, { nil: null }),
    used_usd: fc.option(moneyArb, { nil: null }),
    input_tokens: fc.option(nonNegInt, { nil: null }),
    output_tokens: fc.option(nonNegInt, { nil: null }),
    cache_creation_tokens: fc.option(nonNegInt, { nil: null }),
    cache_read_tokens: fc.option(nonNegInt, { nil: null }),
    image_output_tokens: fc.option(nonNegInt, { nil: null }),
    avg_duration_ms: fc.option(fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }), { nil: null }),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Total token count for a MonthlySummaryRecord (same formula as scatter.ts). */
function expectedTotalTokens(r: MonthlySummaryRecord): number {
  return (
    (r.input_tokens ?? 0) +
    (r.output_tokens ?? 0) +
    (r.cache_creation_tokens ?? 0) +
    (r.cache_read_tokens ?? 0) +
    (r.image_output_tokens ?? 0)
  );
}

/** Total token count for a ModelUsageRecord. */
function modelTotalTokens(r: ModelUsageRecord): number {
  return (
    (r.input_tokens ?? 0) +
    (r.output_tokens ?? 0) +
    (r.cache_creation_tokens ?? 0) +
    (r.cache_read_tokens ?? 0) +
    (r.image_output_tokens ?? 0)
  );
}

// ---------------------------------------------------------------------------
// Property tests: User activity scatter (Requirements 8.1, 8.2)
// ---------------------------------------------------------------------------

describe('Property 26: userActivityScatter – one point per user with correct coordinates', () => {
  it('produces exactly one point per input record (one per user)', () => {
    fc.assert(
      fc.property(fc.array(monthlySummaryArb(), { maxLength: 50 }), (summaries) => {
        const points = userActivityScatter(summaries);
        // One point per input record
        expect(points.length).toBe(summaries.length);
      }),
      { numRuns: 100 },
    );
  });

  it('each point X equals the user request count (Req 8.1)', () => {
    fc.assert(
      fc.property(fc.array(monthlySummaryArb(), { maxLength: 50 }), (summaries) => {
        const points = userActivityScatter(summaries);
        for (let i = 0; i < summaries.length; i++) {
          expect(points[i].x).toBe(summaries[i].request_count ?? 0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('each point Y equals the user Spend (used_usd) (Req 8.1)', () => {
    fc.assert(
      fc.property(fc.array(monthlySummaryArb(), { maxLength: 50 }), (summaries) => {
        const points = userActivityScatter(summaries);
        for (let i = 0; i < summaries.length; i++) {
          const expectedY = summaries[i].used_usd ?? new Decimal(0);
          expect(points[i].y.eq(expectedY)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('point size is monotonic non-decreasing in total token count (Req 8.2)', () => {
    fc.assert(
      fc.property(fc.array(monthlySummaryArb(), { minLength: 2, maxLength: 50 }), (summaries) => {
        const points = userActivityScatter(summaries);
        // For every pair of points, the one with more total tokens has size >= the other's
        for (let i = 0; i < points.length; i++) {
          for (let j = i + 1; j < points.length; j++) {
            if (points[i].totalTokens <= points[j].totalTokens) {
              expect(points[i].size).toBeLessThanOrEqual(points[j].size);
            }
            if (points[j].totalTokens <= points[i].totalTokens) {
              expect(points[j].size).toBeLessThanOrEqual(points[i].size);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('each point totalTokens equals the sum of the five token fields', () => {
    fc.assert(
      fc.property(fc.array(monthlySummaryArb(), { maxLength: 50 }), (summaries) => {
        const points = userActivityScatter(summaries);
        for (let i = 0; i < summaries.length; i++) {
          expect(points[i].totalTokens).toBe(expectedTotalTokens(summaries[i]));
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property tests: Model efficiency scatter (Requirements 11.4)
// ---------------------------------------------------------------------------

describe('Property 26: modelEfficiencyScatter – one point per model with correct coordinates', () => {
  it('produces exactly one point per distinct model', () => {
    fc.assert(
      fc.property(fc.array(modelUsageArb(), { maxLength: 50 }), (models) => {
        const points = modelEfficiencyScatter(models);
        const distinctModels = new Set(models.map((r) => r.model));
        expect(points.length).toBe(distinctModels.size);
      }),
      { numRuns: 100 },
    );
  });

  it('each point Y equals the model total Spend (sum of used_usd) (Req 11.4)', () => {
    fc.assert(
      fc.property(fc.array(modelUsageArb(), { maxLength: 50 }), (models) => {
        const points = modelEfficiencyScatter(models);
        // Build expected Y per model
        const expectedY = new Map<string, Decimal>();
        for (const r of models) {
          const current = expectedY.get(r.model) ?? new Decimal(0);
          expectedY.set(r.model, current.plus(r.used_usd ?? new Decimal(0)));
        }
        for (const p of points) {
          expect(p.y.eq(expectedY.get(p.id)!)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('each point X equals the request-count-weighted average of avg_duration_ms (Req 11.4)', () => {
    fc.assert(
      fc.property(fc.array(modelUsageArb(), { maxLength: 50 }), (models) => {
        const points = modelEfficiencyScatter(models);
        // Build expected X per model using the weighted average formula
        const groups = new Map<string, ModelUsageRecord[]>();
        for (const r of models) {
          const existing = groups.get(r.model);
          if (existing) existing.push(r);
          else groups.set(r.model, [r]);
        }
        for (const p of points) {
          const rows = groups.get(p.id)!;
          const weightedSum = rows.reduce(
            (acc, r) => acc + (r.avg_duration_ms ?? 0) * (r.request_count ?? 0),
            0,
          );
          const totalWeight = rows.reduce((acc, r) => acc + (r.request_count ?? 0), 0);
          const expected = totalWeight === 0 ? 0 : weightedSum / totalWeight;
          const tolerance = 1e-6 * Math.max(1, Math.abs(expected));
          expect(Math.abs(p.x - expected)).toBeLessThanOrEqual(tolerance);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('point size is monotonic non-decreasing in total token count', () => {
    fc.assert(
      fc.property(fc.array(modelUsageArb(), { maxLength: 50 }), (models) => {
        const points = modelEfficiencyScatter(models);
        for (let i = 0; i < points.length; i++) {
          for (let j = i + 1; j < points.length; j++) {
            if (points[i].totalTokens <= points[j].totalTokens) {
              expect(points[i].size).toBeLessThanOrEqual(points[j].size);
            }
            if (points[j].totalTokens <= points[i].totalTokens) {
              expect(points[j].size).toBeLessThanOrEqual(points[i].size);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('each point totalTokens equals the model aggregate of the five token fields', () => {
    fc.assert(
      fc.property(fc.array(modelUsageArb(), { maxLength: 50 }), (models) => {
        const points = modelEfficiencyScatter(models);
        // Build expected total tokens per model
        const expectedTokens = new Map<string, number>();
        for (const r of models) {
          const current = expectedTokens.get(r.model) ?? 0;
          expectedTokens.set(r.model, current + modelTotalTokens(r));
        }
        for (const p of points) {
          expect(p.totalTokens).toBe(expectedTokens.get(p.id)!);
        }
      }),
      { numRuns: 100 },
    );
  });
});
