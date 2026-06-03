import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { RequestDetailRecord } from '@core/compute';
import {
  openRequestDetailDb,
  insertRequestDetailRecords,
  queryRequestDetail,
} from './request-detail-store.js';

/**
 * Integration test for the DuckDB query path (task 17.4).
 * Tests paginated, filtered, and sorted request-detail queries over
 * representative datasets.
 *
 * Validates: Requirements 3.4, 3.5, 3.7
 */

/** Build a request-detail record with sensible defaults, overridable per field. */
function makeRecord(overrides: Partial<RequestDetailRecord> = {}): RequestDetailRecord {
  return {
    billing_month: '2026-05',
    created_at: new Date('2026-05-15T12:00:00.000Z'),
    user_id: 'u1',
    email: 'u1@example.com',
    username: 'user-one',
    api_key_id: 'k1',
    api_key_name: 'key-one',
    request_id: 'r-default',
    model: 'gpt-4o',
    inbound_endpoint: '/v1/chat',
    upstream_endpoint: 'https://upstream/v1/chat',
    input_tokens: 100,
    output_tokens: 200,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    image_output_tokens: 0,
    image_count: 0,
    total_cost_usd: new Decimal('1.000000'),
    actual_cost_usd: new Decimal('0.900000'),
    duration_ms: 500,
    first_token_ms: 50,
    stream: true,
    ip_address: '10.0.0.1',
    user_agent: 'agent/1.0',
    ...overrides,
  };
}

/**
 * Three representative datasets:
 * - Dataset 1: 10 records from user u1, model gpt-4o, key k1 across May 2026
 * - Dataset 2: 5 records from user u2, model claude-3-opus, key k2 across May 2026
 * - Dataset 3: 3 records from user u1, model gemini-pro, key k3 across April 2026
 */
function buildTestDatasets(): RequestDetailRecord[] {
  const dataset1 = Array.from({ length: 10 }, (_, i) =>
    makeRecord({
      request_id: `d1-r${i}`,
      billing_month: '2026-05',
      user_id: 'u1',
      model: 'gpt-4o',
      api_key_id: 'k1',
      created_at: new Date(`2026-05-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`),
      total_cost_usd: new Decimal(`${(i + 1) * 0.5}`),
      duration_ms: 100 + i * 50,
    }),
  );

  const dataset2 = Array.from({ length: 5 }, (_, i) =>
    makeRecord({
      request_id: `d2-r${i}`,
      billing_month: '2026-05',
      user_id: 'u2',
      username: 'user-two',
      email: 'u2@example.com',
      model: 'claude-3-opus',
      api_key_id: 'k2',
      api_key_name: 'key-two',
      created_at: new Date(`2026-05-${String(i + 10).padStart(2, '0')}T14:00:00.000Z`),
      total_cost_usd: new Decimal(`${(i + 1) * 2.0}`),
      duration_ms: 200 + i * 100,
    }),
  );

  const dataset3 = Array.from({ length: 3 }, (_, i) =>
    makeRecord({
      request_id: `d3-r${i}`,
      billing_month: '2026-04',
      user_id: 'u1',
      model: 'gemini-pro',
      api_key_id: 'k3',
      api_key_name: 'key-three',
      created_at: new Date(`2026-04-${String(i + 20).padStart(2, '0')}T08:00:00.000Z`),
      total_cost_usd: new Decimal(`${(i + 1) * 3.0}`),
      duration_ms: 300 + i * 200,
    }),
  );

  return [...dataset1, ...dataset2, ...dataset3];
}

describe('DuckDB query path integration (task 17.4, Req 3.4, 3.5, 3.7)', () => {
  let connection: DuckDBConnection;

  beforeAll(async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, buildTestDatasets());
  });

  afterAll(() => {
    connection.closeSync();
  });

  // --- Pagination -----------------------------------------------------------

  describe('pagination', () => {
    it('returns the first page with correct totalCount and totalPages', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        pageSize: 5,
        page: 1,
      });

      // 10 records from dataset1 + 5 from dataset2 = 15 total for May
      expect(result.totalCount).toBe(15);
      expect(result.totalPages).toBe(3); // ceil(15 / 5)
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(5);
      expect(result.records).toHaveLength(5);
    });

    it('returns the second page with the correct set of records', async () => {
      const page1 = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        pageSize: 5,
        page: 1,
        sortBy: 'created_at',
        sortDir: 'asc',
      });
      const page2 = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        pageSize: 5,
        page: 2,
        sortBy: 'created_at',
        sortDir: 'asc',
      });

      // Pages should not overlap
      const page1Ids = page1.records.map((r) => r.request_id);
      const page2Ids = page2.records.map((r) => r.request_id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);

      // Both should have 5 records
      expect(page1.records).toHaveLength(5);
      expect(page2.records).toHaveLength(5);

      // Totals should be consistent
      expect(page2.totalCount).toBe(15);
      expect(page2.totalPages).toBe(3);
    });

    it('returns an empty page when requesting beyond the last page (Req 3.8)', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        pageSize: 5,
        page: 99,
      });

      expect(result.records).toEqual([]);
      expect(result.totalCount).toBe(15);
      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(99);
    });

    it('returns a partial last page when records do not divide evenly', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        pageSize: 4,
        page: 4, // 15 records / 4 per page = 4 pages, last page has 3 records
        sortBy: 'created_at',
        sortDir: 'asc',
      });

      expect(result.totalCount).toBe(15);
      expect(result.totalPages).toBe(4); // ceil(15/4)
      expect(result.records).toHaveLength(3);
    });
  });

  // --- Filtering ------------------------------------------------------------

  describe('filtering', () => {
    it('filters by user_id', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        userId: 'u2',
      });

      expect(result.totalCount).toBe(5);
      expect(result.records.every((r) => r.user_id === 'u2')).toBe(true);
    });

    it('filters by model', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        model: 'claude-3-opus',
      });

      expect(result.totalCount).toBe(5);
      expect(result.records.every((r) => r.model === 'claude-3-opus')).toBe(true);
    });

    it('filters by api_key_id', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        apiKeyId: 'k1',
      });

      expect(result.totalCount).toBe(10);
      expect(result.records.every((r) => r.api_key_id === 'k1')).toBe(true);
    });

    it('filters by inclusive date range (Req 3.4)', async () => {
      // Dataset1 dates are May 1-10, Dataset2 dates are May 10-14
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        dateRange: {
          start: new Date('2026-05-05T00:00:00.000Z'),
          end: new Date('2026-05-10T23:59:59.999Z'),
        },
      });

      // Should include dataset1 records from May 5-10 (6 records) + dataset2 May 10 (1 record)
      expect(result.totalCount).toBe(7);
      for (const record of result.records) {
        expect(record.created_at!.getTime()).toBeGreaterThanOrEqual(
          new Date('2026-05-05T00:00:00.000Z').getTime(),
        );
        expect(record.created_at!.getTime()).toBeLessThanOrEqual(
          new Date('2026-05-10T23:59:59.999Z').getTime(),
        );
      }
    });

    it('applies conjunctive (AND) filters combining user + model (Req 3.4)', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        userId: 'u1',
        model: 'gpt-4o',
      });

      expect(result.totalCount).toBe(10);
      expect(result.records.every((r) => r.user_id === 'u1' && r.model === 'gpt-4o')).toBe(true);
    });

    it('applies conjunctive filters: user + key + date range', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        userId: 'u1',
        apiKeyId: 'k1',
        dateRange: {
          start: new Date('2026-05-03T00:00:00.000Z'),
          end: new Date('2026-05-07T23:59:59.999Z'),
        },
      });

      // Should include dataset1 records from May 3-7: d1-r2, d1-r3, d1-r4, d1-r5, d1-r6
      expect(result.totalCount).toBe(5);
      for (const record of result.records) {
        expect(record.user_id).toBe('u1');
        expect(record.api_key_id).toBe('k1');
      }
    });

    it('returns zero results when filters match nothing', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        userId: 'u1',
        model: 'claude-3-opus', // u1 does not use claude in May
      });

      expect(result.totalCount).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.records).toEqual([]);
    });

    it('scopes results by billing_month (only returns matching month)', async () => {
      const aprilResult = await queryRequestDetail(connection, {
        billingMonth: '2026-04',
      });

      expect(aprilResult.totalCount).toBe(3);
      expect(aprilResult.records.every((r) => r.billing_month === '2026-04')).toBe(true);

      const mayResult = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
      });

      expect(mayResult.totalCount).toBe(15);
      expect(mayResult.records.every((r) => r.billing_month === '2026-05')).toBe(true);
    });
  });

  // --- Sorting --------------------------------------------------------------

  describe('sorting', () => {
    it('defaults to created_at descending (Req 3.5)', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        pageSize: 15,
      });

      const dates = result.records.map((r) => r.created_at!.getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]!).toBeLessThanOrEqual(dates[i - 1]!);
      }
    });

    it('sorts by created_at ascending', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        sortBy: 'created_at',
        sortDir: 'asc',
        pageSize: 15,
      });

      const dates = result.records.map((r) => r.created_at!.getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]!).toBeGreaterThanOrEqual(dates[i - 1]!);
      }
    });

    it('sorts by total_cost_usd descending', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        sortBy: 'total_cost_usd',
        sortDir: 'desc',
        pageSize: 15,
      });

      const costs = result.records.map((r) => r.total_cost_usd!.toNumber());
      for (let i = 1; i < costs.length; i++) {
        expect(costs[i]!).toBeLessThanOrEqual(costs[i - 1]!);
      }
    });

    it('sorts by total_cost_usd ascending', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        sortBy: 'total_cost_usd',
        sortDir: 'asc',
        pageSize: 15,
      });

      const costs = result.records.map((r) => r.total_cost_usd!.toNumber());
      for (let i = 1; i < costs.length; i++) {
        expect(costs[i]!).toBeGreaterThanOrEqual(costs[i - 1]!);
      }
    });

    it('sorts by duration_ms descending', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        sortBy: 'duration_ms',
        sortDir: 'desc',
        pageSize: 15,
      });

      const durations = result.records.map((r) => r.duration_ms!);
      for (let i = 1; i < durations.length; i++) {
        expect(durations[i]!).toBeLessThanOrEqual(durations[i - 1]!);
      }
    });

    it('sorts by duration_ms ascending', async () => {
      const result = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        sortBy: 'duration_ms',
        sortDir: 'asc',
        pageSize: 15,
      });

      const durations = result.records.map((r) => r.duration_ms!);
      for (let i = 1; i < durations.length; i++) {
        expect(durations[i]!).toBeGreaterThanOrEqual(durations[i - 1]!);
      }
    });

    it('sorting is stable with pagination (page 1 + page 2 cover all records)', async () => {
      const page1 = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        sortBy: 'total_cost_usd',
        sortDir: 'asc',
        pageSize: 8,
        page: 1,
      });
      const page2 = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        sortBy: 'total_cost_usd',
        sortDir: 'asc',
        pageSize: 8,
        page: 2,
      });

      const allIds = [...page1.records.map((r) => r.request_id), ...page2.records.map((r) => r.request_id)];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length); // no duplicates across pages
      expect(allIds.length).toBe(15); // all records covered
    });
  });

  // --- Pagination + totalCount/totalPages correctness -----------------------

  describe('totalCount and totalPages correctness', () => {
    it('totalPages is ceil(totalCount / pageSize)', async () => {
      for (const pageSize of [3, 5, 7, 10, 15, 20]) {
        const result = await queryRequestDetail(connection, {
          billingMonth: '2026-05',
          pageSize,
        });
        expect(result.totalPages).toBe(Math.ceil(result.totalCount / pageSize));
      }
    });

    it('totalCount reflects filters, not the whole table', async () => {
      const unfiltered = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
      });
      expect(unfiltered.totalCount).toBe(15);

      const filtered = await queryRequestDetail(connection, {
        billingMonth: '2026-05',
        userId: 'u2',
      });
      expect(filtered.totalCount).toBe(5);
    });

    it('totalCount and totalPages remain consistent across all pages', async () => {
      const pageSize = 4;
      const totalPages = Math.ceil(15 / pageSize);

      for (let p = 1; p <= totalPages; p++) {
        const result = await queryRequestDetail(connection, {
          billingMonth: '2026-05',
          pageSize,
          page: p,
          sortBy: 'created_at',
          sortDir: 'asc',
        });
        expect(result.totalCount).toBe(15);
        expect(result.totalPages).toBe(totalPages);
      }
    });
  });
});
