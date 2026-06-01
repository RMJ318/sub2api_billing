import { describe, it, expect, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { RequestDetailRecord } from '@core/compute';
import {
  openRequestDetailDb,
  insertRequestDetailRecords,
  queryRequestDetail,
  REQUEST_DETAIL_TABLE,
} from './request-detail-store.js';

/**
 * Minimal example tests for the DuckDB `request_detail` schema + query path
 * (Requirement 3.1, with filter/sort/pagination from Req 3.4, 3.5, 3.7, 3.8).
 * The broad integration coverage lives in task 17.4; these confirm the schema
 * actually creates and a query actually runs against DuckDB.
 */

let connection: DuckDBConnection | undefined;

afterEach(() => {
  connection?.closeSync();
  connection = undefined;
});

/** Build a request-detail record with sensible defaults, overridable per field. */
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

describe('request_detail DuckDB schema + queryRequestDetail (Req 3.1)', () => {
  it('creates the table on open', async () => {
    connection = await openRequestDetailDb();
    const reader = await connection.runAndReadAll(
      `SELECT count(*) AS cnt FROM ${REQUEST_DETAIL_TABLE};`,
    );
    expect(Number(reader.getRows()[0]![0] as bigint)).toBe(0);
  });

  it('inserts and round-trips a record preserving decimal precision and timestamp', async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, [makeRecord()]);

    const result = await queryRequestDetail(connection, { billingMonth: '2026-05' });
    expect(result.totalCount).toBe(1);
    expect(result.totalPages).toBe(1);
    const record = result.records[0]!;
    expect(record.request_id).toBe('r1');
    expect(record.total_cost_usd?.toString()).toBe('1.234567');
    expect(record.created_at?.toISOString()).toBe('2026-05-10T12:00:00.000Z');
    expect(record.stream).toBe(true);
    expect(record.input_tokens).toBe(100);
  });

  it('applies conjunctive filters before pagination (Req 3.4)', async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, [
      makeRecord({ request_id: 'r1', user_id: 'u1', model: 'gpt-4o' }),
      makeRecord({ request_id: 'r2', user_id: 'u2', model: 'gpt-4o' }),
      makeRecord({ request_id: 'r3', user_id: 'u1', model: 'claude-3' }),
    ]);

    const result = await queryRequestDetail(connection, {
      billingMonth: '2026-05',
      userId: 'u1',
      model: 'gpt-4o',
    });
    expect(result.totalCount).toBe(1);
    expect(result.records.map((r) => r.request_id)).toEqual(['r1']);
  });

  it('excludes records outside the inclusive date range (Req 3.4)', async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, [
      makeRecord({ request_id: 'early', created_at: new Date('2026-05-01T00:00:00.000Z') }),
      makeRecord({ request_id: 'mid', created_at: new Date('2026-05-15T00:00:00.000Z') }),
      makeRecord({ request_id: 'late', created_at: new Date('2026-05-30T00:00:00.000Z') }),
    ]);

    const result = await queryRequestDetail(connection, {
      billingMonth: '2026-05',
      dateRange: {
        start: new Date('2026-05-10T00:00:00.000Z'),
        end: new Date('2026-05-20T00:00:00.000Z'),
      },
    });
    expect(result.records.map((r) => r.request_id)).toEqual(['mid']);
  });

  it('sorts by total_cost_usd ascending and descending (Req 3.5)', async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, [
      makeRecord({ request_id: 'cheap', total_cost_usd: new Decimal('1.000000') }),
      makeRecord({ request_id: 'mid', total_cost_usd: new Decimal('2.500000') }),
      makeRecord({ request_id: 'pricey', total_cost_usd: new Decimal('9.999999') }),
    ]);

    const asc = await queryRequestDetail(connection, {
      billingMonth: '2026-05',
      sortBy: 'total_cost_usd',
      sortDir: 'asc',
    });
    expect(asc.records.map((r) => r.request_id)).toEqual(['cheap', 'mid', 'pricey']);

    const desc = await queryRequestDetail(connection, {
      billingMonth: '2026-05',
      sortBy: 'total_cost_usd',
      sortDir: 'desc',
    });
    expect(desc.records.map((r) => r.request_id)).toEqual(['pricey', 'mid', 'cheap']);
  });

  it('defaults to created_at descending sort (Req 3.5)', async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, [
      makeRecord({ request_id: 'oldest', created_at: new Date('2026-05-01T00:00:00.000Z') }),
      makeRecord({ request_id: 'newest', created_at: new Date('2026-05-28T00:00:00.000Z') }),
      makeRecord({ request_id: 'middle', created_at: new Date('2026-05-14T00:00:00.000Z') }),
    ]);

    const result = await queryRequestDetail(connection, { billingMonth: '2026-05' });
    expect(result.records.map((r) => r.request_id)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('paginates with correct totals and an empty page beyond the last (Req 3.7, 3.8)', async () => {
    connection = await openRequestDetailDb();
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({
        request_id: `r${i}`,
        created_at: new Date(`2026-05-0${i + 1}T00:00:00.000Z`),
      }),
    );
    await insertRequestDetailRecords(connection, records);

    const page1 = await queryRequestDetail(connection, {
      billingMonth: '2026-05',
      pageSize: 2,
      page: 1,
      sortBy: 'created_at',
      sortDir: 'asc',
    });
    expect(page1.totalCount).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.records.map((r) => r.request_id)).toEqual(['r0', 'r1']);

    const page3 = await queryRequestDetail(connection, {
      billingMonth: '2026-05',
      pageSize: 2,
      page: 3,
      sortBy: 'created_at',
      sortDir: 'asc',
    });
    expect(page3.records.map((r) => r.request_id)).toEqual(['r4']);

    // Page beyond the last: empty records, totals unchanged (Req 3.8).
    const page4 = await queryRequestDetail(connection, {
      billingMonth: '2026-05',
      pageSize: 2,
      page: 4,
    });
    expect(page4.records).toEqual([]);
    expect(page4.totalCount).toBe(5);
    expect(page4.totalPages).toBe(3);
  });

  it('scopes results to the requested billing month (Req 3.3 capability)', async () => {
    connection = await openRequestDetailDb();
    await insertRequestDetailRecords(connection, [
      makeRecord({ request_id: 'apr', billing_month: '2026-04' }),
      makeRecord({ request_id: 'may', billing_month: '2026-05' }),
    ]);

    const result = await queryRequestDetail(connection, { billingMonth: '2026-04' });
    expect(result.records.map((r) => r.request_id)).toEqual(['apr']);
  });
});
