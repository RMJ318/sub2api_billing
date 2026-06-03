/**
 * Property 23: Request-detail filters combine conjunctively
 * (design "Property 23", Requirements 3.4, 4.3).
 *
 * For any set of Request_Detail_Records and any combination of user, model,
 * API key, and Date_Range_Filter criteria, every returned record satisfies all
 * provided criteria and no record satisfying all of them is omitted.
 *
 * **Validates: Requirements 3.4, 4.3**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import type { DuckDBConnection } from '@duckdb/node-api';
import { Decimal } from 'decimal.js';
import type { RequestDetailRecord, RequestDetailQuery } from '@core/compute';
import {
  openRequestDetailDb,
  insertRequestDetailRecords,
  queryRequestDetail,
} from './request-detail-store.js';

// --- Constrained arbitraries ------------------------------------------------

// Small pools so records will collide on filter dimensions, exercising the
// conjunctive logic rather than always producing unique values.
const BILLING_MONTH = '2026-05';
const USER_IDS = ['alice', 'bob', 'carol'];
const MODELS = ['gpt-4o', 'claude-3', 'gemini-pro'];
const API_KEY_IDS = ['key-1', 'key-2', 'key-3'];

// Date pool within the billing month so date-range filtering is meaningful.
const DATE_POOL = [
  new Date('2026-05-01T10:00:00Z'),
  new Date('2026-05-05T14:30:00Z'),
  new Date('2026-05-10T08:00:00Z'),
  new Date('2026-05-15T18:45:00Z'),
  new Date('2026-05-20T22:00:00Z'),
  new Date('2026-05-25T06:15:00Z'),
  new Date('2026-05-30T12:00:00Z'),
];

const userIdArb = fc.constantFrom(...USER_IDS);
const modelArb = fc.constantFrom(...MODELS);
const apiKeyIdArb = fc.constantFrom(...API_KEY_IDS);
const dateArb = fc.constantFrom(...DATE_POOL);

/** Generate a minimal valid RequestDetailRecord with constrained filter fields. */
const recordArb = fc
  .record({
    user_id: userIdArb,
    model: modelArb,
    api_key_id: apiKeyIdArb,
    created_at: dateArb,
    id: fc.uuid(),
  })
  .map(({ user_id, model, api_key_id, created_at, id }): RequestDetailRecord => ({
    billing_month: BILLING_MONTH,
    created_at,
    user_id,
    email: null,
    username: null,
    api_key_id,
    api_key_name: null,
    request_id: id,
    model,
    inbound_endpoint: null,
    upstream_endpoint: null,
    input_tokens: null,
    output_tokens: null,
    cache_creation_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    image_count: null,
    total_cost_usd: new Decimal('1.00'),
    actual_cost_usd: null,
    duration_ms: null,
    first_token_ms: null,
    stream: null,
    ip_address: null,
    user_agent: null,
  }));

/** Generate a set of records (1..30). */
const recordsArb = fc.array(recordArb, { minLength: 1, maxLength: 30 });

/**
 * Generate a filter combination. Each filter dimension is independently
 * present or absent, giving 2^4 = 16 combinations. When a date range is
 * present, start <= end is ensured.
 */
const filtersArb = fc.record({
  userId: fc.option(userIdArb, { nil: undefined }),
  model: fc.option(modelArb, { nil: undefined }),
  apiKeyId: fc.option(apiKeyIdArb, { nil: undefined }),
  dateRange: fc.option(
    fc
      .tuple(dateArb, dateArb)
      .map(([a, b]) =>
        a.getTime() <= b.getTime() ? { start: a, end: b } : { start: b, end: a },
      ),
    { nil: undefined },
  ),
});

// --- Reference filter implementation (the oracle) ---------------------------

/**
 * Apply the same conjunctive filter logic as the DuckDB query, but in pure JS.
 * This is our oracle: a record must match ALL active filters.
 */
function matchesAllFilters(
  record: RequestDetailRecord,
  filters: {
    userId?: string;
    model?: string;
    apiKeyId?: string;
    dateRange?: { start: Date; end: Date };
  },
): boolean {
  if (filters.userId !== undefined && record.user_id !== filters.userId) {
    return false;
  }
  if (filters.model !== undefined && record.model !== filters.model) {
    return false;
  }
  if (filters.apiKeyId !== undefined && record.api_key_id !== filters.apiKeyId) {
    return false;
  }
  if (filters.dateRange !== undefined && record.created_at !== null) {
    const ts = record.created_at.getTime();
    if (ts < filters.dateRange.start.getTime() || ts > filters.dateRange.end.getTime()) {
      return false;
    }
  }
  return true;
}

// --- Test --------------------------------------------------------------------

describe('Property 23: Request-detail filters combine conjunctively', () => {
  let connection: DuckDBConnection;

  beforeEach(async () => {
    connection = await openRequestDetailDb();
  });

  afterEach(() => {
    connection.closeSync();
  });

  it('every returned record satisfies ALL active filters and no matching record is omitted', async () => {
    await fc.assert(
      fc.asyncProperty(recordsArb, filtersArb, async (records, filters) => {
        // Fresh DB per property run: re-create schema.
        connection.closeSync();
        connection = await openRequestDetailDb();

        // Insert all generated records.
        await insertRequestDetailRecords(connection, records);

        // Query with generated filters (large page size to get all results).
        const query: RequestDetailQuery = {
          billingMonth: BILLING_MONTH,
          userId: filters.userId,
          model: filters.model,
          apiKeyId: filters.apiKeyId,
          dateRange: filters.dateRange,
          pageSize: 1000, // ensure we get all matching records in one page
        };

        const result = await queryRequestDetail(connection, query);

        // Oracle: compute the expected set by filtering in JS.
        const expected = records.filter((r) => matchesAllFilters(r, filters));

        // 1. Completeness: totalCount matches the oracle count.
        expect(result.totalCount).toBe(expected.length);

        // 2. Soundness: every returned record satisfies ALL active filters.
        for (const returned of result.records) {
          if (filters.userId !== undefined) {
            expect(returned.user_id).toBe(filters.userId);
          }
          if (filters.model !== undefined) {
            expect(returned.model).toBe(filters.model);
          }
          if (filters.apiKeyId !== undefined) {
            expect(returned.api_key_id).toBe(filters.apiKeyId);
          }
          if (filters.dateRange !== undefined && returned.created_at !== null) {
            const ts = returned.created_at.getTime();
            expect(ts).toBeGreaterThanOrEqual(filters.dateRange.start.getTime());
            expect(ts).toBeLessThanOrEqual(filters.dateRange.end.getTime());
          }
        }

        // 3. No matching record is omitted: returned request_ids cover all expected.
        const returnedIds = new Set(result.records.map((r) => r.request_id));
        const expectedIds = new Set(expected.map((r) => r.request_id));
        expect(returnedIds).toEqual(expectedIds);
      }),
      { numRuns: 50 },
    );
  });
});
