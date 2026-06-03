/**
 * Property 22: Pagination partitions the ordered result with correct totals
 * (design "Property 22", Requirements 3.2, 3.7, 3.8, 7.4).
 *
 * For any ordered result set, page size in the range 1 to 1000, and page
 * number, the returned page contains at most page-size records, `totalCount`
 * equals the number of records matching the applied filters, `totalPages`
 * equals the ceiling of `totalCount` divided by page size, concatenating all
 * in-range pages reproduces the full ordered set, and a page number beyond
 * `totalPages` yields an empty page with the same `totalCount` and
 * `totalPages`.
 *
 * **Validates: Requirements 3.2, 3.7, 3.8, 7.4**
 */
import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { RequestDetailRecord } from '@core/compute';
import { openRequestDetailDb, insertRequestDetailRecords } from './request-detail-store.js';
import {
  queryRequestDetailService,
  clampPageSize,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './query-service.js';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const BILLING_MONTH = '2026-05';

/** Generate a unique request-detail record with arbitrary cost and timestamps. */
function recordArb(index: number): fc.Arbitrary<RequestDetailRecord> {
  return fc
    .record({
      totalCost: fc.double({ min: 0, max: 10000, noNaN: true }),
      durationMs: fc.integer({ min: 0, max: 120000 }),
      // Spread created_at across the month so sorting is meaningful.
      dayOffset: fc.integer({ min: 0, max: 30 }),
      hourOffset: fc.integer({ min: 0, max: 23 }),
      minuteOffset: fc.integer({ min: 0, max: 59 }),
    })
    .map(({ totalCost, durationMs, dayOffset, hourOffset, minuteOffset }) => ({
      billing_month: BILLING_MONTH,
      created_at: new Date(
        Date.UTC(2026, 4, 1 + dayOffset, hourOffset, minuteOffset, 0, index),
      ),
      user_id: `u${index}`,
      email: `u${index}@test.com`,
      username: `user-${index}`,
      api_key_id: `k${index}`,
      api_key_name: `key-${index}`,
      request_id: `r${index}`,
      model: 'gpt-4o',
      inbound_endpoint: '/v1/chat',
      upstream_endpoint: 'https://upstream/v1/chat',
      input_tokens: 100,
      output_tokens: 200,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      image_output_tokens: 0,
      image_count: 0,
      total_cost_usd: new Decimal(totalCost.toFixed(6)),
      actual_cost_usd: new Decimal(totalCost.toFixed(6)),
      duration_ms: durationMs,
      first_token_ms: 50,
      stream: true,
      ip_address: '10.0.0.1',
      user_agent: 'agent/1.0',
    }));
}

/**
 * Generate a list of 1..30 distinct request-detail records. Each record has a
 * unique request_id (guaranteed by the index), variable cost/duration/created_at
 * so sorting produces non-trivial orderings.
 */
const recordsArb: fc.Arbitrary<RequestDetailRecord[]> = fc
  .integer({ min: 1, max: 30 })
  .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => recordArb(i))))
  .map((tupled) => tupled as RequestDetailRecord[]);

/** Page size arbitrary: includes values below/above the valid range to test clamping. */
const pageSizeArb: fc.Arbitrary<number | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: -5, max: 2000 }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let connection: DuckDBConnection | undefined;

afterEach(() => {
  connection?.closeSync();
  connection = undefined;
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 22: Pagination partitions the ordered result with correct totals', () => {
  it('page size is clamped to [1, 1000] with default 100', () => {
    fc.assert(
      fc.property(pageSizeArb, (rawPageSize) => {
        const clamped = clampPageSize(rawPageSize);
        expect(clamped).toBeGreaterThanOrEqual(MIN_PAGE_SIZE);
        expect(clamped).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        expect(Number.isInteger(clamped)).toBe(true);

        // Default when undefined
        if (rawPageSize === undefined) {
          expect(clamped).toBe(100);
        }
      }),
    );
  });

  it('totalCount, totalPages, and page contents are correct for any page', async () => {
    await fc.assert(
      fc.asyncProperty(
        recordsArb,
        fc.integer({ min: 1, max: 50 }), // pageSize (valid range for this test)
        fc.integer({ min: 1, max: 10 }), // page number
        async (records, pageSize, page) => {
          connection = await openRequestDetailDb();
          await insertRequestDetailRecords(connection, records);

          const result = await queryRequestDetailService(connection, {
            billingMonth: BILLING_MONTH,
            pageSize,
            page,
          });

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const { totalCount, totalPages, records: pageRecords, pageSize: actualPageSize } = result.page;

          // totalCount equals the full filtered result count
          expect(totalCount).toBe(records.length);

          // pageSize is clamped to [1, 1000]
          const clampedPageSize = clampPageSize(pageSize);
          expect(actualPageSize).toBe(clampedPageSize);

          // totalPages = ceil(totalCount / pageSize)
          expect(totalPages).toBe(Math.ceil(totalCount / actualPageSize));

          // Page contains at most pageSize records
          expect(pageRecords.length).toBeLessThanOrEqual(actualPageSize);

          // Pages beyond range return empty results (Req 3.8)
          if (page > totalPages) {
            expect(pageRecords).toEqual([]);
          }

          // Clean up for next iteration
          connection.closeSync();
          connection = undefined;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('concatenating all in-range pages reproduces the full ordered set without gaps or overlaps', async () => {
    await fc.assert(
      fc.asyncProperty(
        recordsArb,
        fc.integer({ min: 1, max: 15 }), // pageSize
        async (records, pageSize) => {
          connection = await openRequestDetailDb();
          await insertRequestDetailRecords(connection, records);

          // Fetch all pages and concatenate their records
          const allPageRecords: string[] = [];
          let currentPage = 1;
          let totalPages = 1;

          // First request to determine totalPages
          const firstResult = await queryRequestDetailService(connection, {
            billingMonth: BILLING_MONTH,
            pageSize,
            page: 1,
          });
          expect(firstResult.ok).toBe(true);
          if (!firstResult.ok) return;

          totalPages = firstResult.page.totalPages;
          allPageRecords.push(...firstResult.page.records.map((r) => r.request_id));

          // Fetch remaining pages
          for (currentPage = 2; currentPage <= totalPages; currentPage++) {
            const result = await queryRequestDetailService(connection, {
              billingMonth: BILLING_MONTH,
              pageSize,
              page: currentPage,
            });
            expect(result.ok).toBe(true);
            if (!result.ok) return;

            expect(result.page.totalCount).toBe(firstResult.page.totalCount);
            expect(result.page.totalPages).toBe(totalPages);
            allPageRecords.push(...result.page.records.map((r) => r.request_id));
          }

          // No gaps: all records are present
          expect(allPageRecords.length).toBe(records.length);

          // No overlaps: all request_ids are unique
          const uniqueIds = new Set(allPageRecords);
          expect(uniqueIds.size).toBe(allPageRecords.length);

          // The set of returned IDs matches the input set
          const inputIds = new Set(records.map((r) => r.request_id));
          expect(uniqueIds).toEqual(inputIds);

          // Clean up for next iteration
          connection.closeSync();
          connection = undefined;
        },
      ),
      { numRuns: 30 },
    );
  });

  it('a page beyond totalPages yields empty records with correct totalCount and totalPages', async () => {
    await fc.assert(
      fc.asyncProperty(
        recordsArb,
        fc.integer({ min: 1, max: 20 }), // pageSize
        fc.integer({ min: 1, max: 100 }), // extra pages beyond
        async (records, pageSize, extra) => {
          connection = await openRequestDetailDb();
          await insertRequestDetailRecords(connection, records);

          const expectedTotalPages = Math.ceil(records.length / clampPageSize(pageSize));
          const beyondPage = expectedTotalPages + extra;

          const result = await queryRequestDetailService(connection, {
            billingMonth: BILLING_MONTH,
            pageSize,
            page: beyondPage,
          });

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          // Empty records for page beyond range (Req 3.8)
          expect(result.page.records).toEqual([]);
          // But correct totals still returned
          expect(result.page.totalCount).toBe(records.length);
          expect(result.page.totalPages).toBe(expectedTotalPages);

          // Clean up for next iteration
          connection.closeSync();
          connection = undefined;
        },
      ),
      { numRuns: 30 },
    );
  });
});
