import { describe, it, expect, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { RequestDetailRecord } from '@core/compute';
import { openRequestDetailDb, insertRequestDetailRecords } from './request-detail-store.js';
import {
  clampPageSize,
  queryRequestDetailService,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './query-service.js';

/**
 * Smoke tests for the Query Service guard layer (task 17.1, Requirements 3.2,
 * 3.3, 3.4, 3.5, 3.7, 3.8). These confirm the guards (required Billing_Month,
 * page-size clamp) work and that the path delegates correctly to DuckDB. The
 * exhaustive property/integration/unit coverage lives in tasks 17.2–17.5.
 */

let connection: DuckDBConnection | undefined;

afterEach(() => {
  connection?.closeSync();
  connection = undefined;
});

function makeRecord(overrides: Partial<RequestDetailRecord> = {}): RequestDetailRecord {
  return {
    billing_month: '2026-05',
    created_at: new Date('2026-05-10T12:00:00.000Z'),
    user_id: 'u1',
    email: 'u1@example.com',
    username: 'user-one',
    api_key_id: 'k1',
    api_key_name: 'key-one',
    request_id: 'r1',
    model: 'gpt-4o',
    inbound_endpoint: '/v1/chat',
    upstream_endpoint: 'https://upstream/v1/chat',
    input_tokens: 100,
    output_tokens: 200,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    image_output_tokens: 0,
    image_count: 0,
    total_cost_usd: new Decimal('1.234567'),
    actual_cost_usd: new Decimal('1.000000'),
    duration_ms: 500,
    first_token_ms: 50,
    stream: true,
    ip_address: '10.0.0.1',
    user_agent: 'agent/1.0',
    ...overrides,
  };
}

describe('clampPageSize (Req 3.2)', () => {
  it('defaults to 100 when omitted or non-finite', () => {
    expect(clampPageSize(undefined)).toBe(100);
    expect(clampPageSize(Number.NaN)).toBe(100);
    // Infinity is non-finite, so it falls back to the default rather than the max.
    expect(clampPageSize(Number.POSITIVE_INFINITY)).toBe(100);
  });

  it('clamps to the inclusive 1..1000 range and floors fractions', () => {
    expect(clampPageSize(0)).toBe(MIN_PAGE_SIZE);
    expect(clampPageSize(-5)).toBe(MIN_PAGE_SIZE);
    expect(clampPageSize(1)).toBe(1);
    expect(clampPageSize(50.9)).toBe(50);
    expect(clampPageSize(1000)).toBe(1000);
    expect(clampPageSize(5000)).toBe(MAX_PAGE_SIZE);
  });
});

describe('queryRequestDetailService guards (Req 3.2, 3.3, 3.4, 3.5, 3.7, 3.8)', () => {
  it('rejects a missing Billing_Month before any DuckDB access (Req 3.3)', async () => {
    // No connection is opened: a rejected request must never touch DuckDB.
    const result = await queryRequestDetailService(undefined as never, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('billing_month_required');
      expect(result.error).toMatch(/billing_month/i);
    }
  });

  it('rejects a blank Billing_Month (Req 3.3)', async () => {
    const result = await queryRequestDetailService(undefined as never, { billingMonth: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('billing_month_required');
    }
  });

  it('serves a page with totals and the default created_at desc sort (Req 3.5, 3.7)', async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, [
      makeRecord({ request_id: 'oldest', created_at: new Date('2026-05-01T00:00:00.000Z') }),
      makeRecord({ request_id: 'newest', created_at: new Date('2026-05-28T00:00:00.000Z') }),
      makeRecord({ request_id: 'middle', created_at: new Date('2026-05-14T00:00:00.000Z') }),
    ]);

    const result = await queryRequestDetailService(connection, { billingMonth: '2026-05' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.page.pageSize).toBe(100);
      expect(result.page.totalCount).toBe(3);
      expect(result.page.totalPages).toBe(1);
      expect(result.page.records.map((r) => r.request_id)).toEqual(['newest', 'middle', 'oldest']);
    }
  });

  it('clamps an out-of-range page size before delegating (Req 3.2)', async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, [makeRecord()]);

    const tooSmall = await queryRequestDetailService(connection, {
      billingMonth: '2026-05',
      pageSize: 0,
    });
    expect(tooSmall.ok).toBe(true);
    if (tooSmall.ok) {
      expect(tooSmall.page.pageSize).toBe(1);
    }

    const tooLarge = await queryRequestDetailService(connection, {
      billingMonth: '2026-05',
      pageSize: 99999,
    });
    expect(tooLarge.ok).toBe(true);
    if (tooLarge.ok) {
      expect(tooLarge.page.pageSize).toBe(1000);
    }
  });

  it('applies conjunctive filters and returns an empty page beyond range (Req 3.4, 3.8)', async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, [
      makeRecord({ request_id: 'r1', user_id: 'u1', model: 'gpt-4o' }),
      makeRecord({ request_id: 'r2', user_id: 'u2', model: 'gpt-4o' }),
      makeRecord({ request_id: 'r3', user_id: 'u1', model: 'claude-3' }),
    ]);

    const filtered = await queryRequestDetailService(connection, {
      billingMonth: '2026-05',
      userId: 'u1',
      model: 'gpt-4o',
    });
    expect(filtered.ok).toBe(true);
    if (filtered.ok) {
      expect(filtered.page.totalCount).toBe(1);
      expect(filtered.page.records.map((r) => r.request_id)).toEqual(['r1']);
    }

    const beyond = await queryRequestDetailService(connection, {
      billingMonth: '2026-05',
      pageSize: 2,
      page: 99,
    });
    expect(beyond.ok).toBe(true);
    if (beyond.ok) {
      expect(beyond.page.records).toEqual([]);
      expect(beyond.page.totalCount).toBe(3);
      expect(beyond.page.totalPages).toBe(2);
    }
  });
});
