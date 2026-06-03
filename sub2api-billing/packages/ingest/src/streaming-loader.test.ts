/**
 * Integration tests for the streaming loader (task 15.5).
 *
 * Verifies that `streamRequestDetail`:
 *  - Reads a CSV file in streaming mode and inserts records into DuckDB.
 *  - Processes records in configurable batch sizes.
 *  - Applies Billing_Month fallback from the folder name.
 *  - Reports rejected rows with proper log entries.
 *  - Handles empty files and files with only a header.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openRequestDetailDb, queryRequestDetail } from '@core/store';
import type { DuckDBConnection } from '@duckdb/node-api';
import { streamRequestDetail } from './streaming-loader.js';

/** Create a temp directory for test fixtures. */
function makeTempDir(): string {
  const dir = join(tmpdir(), `streaming-loader-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Generate a valid request_detail CSV row. */
function makeRow(requestId: string, billingMonth = ''): string {
  return [
    billingMonth,                          // billing_month
    '2026-04-10T12:00:00Z',               // created_at
    'user-1',                              // user_id
    'user@example.com',                    // email
    'testuser',                            // username
    'key-1',                               // api_key_id
    'My Key',                              // api_key_name
    requestId,                             // request_id
    'gpt-4o',                              // model
    '/v1/chat/completions',                // inbound_endpoint
    'https://api.openai.com/v1/chat/completions', // upstream_endpoint
    '100',                                 // input_tokens
    '50',                                  // output_tokens
    '0',                                   // cache_creation_tokens
    '0',                                   // cache_read_tokens
    '0',                                   // image_output_tokens
    '0',                                   // image_count
    '0.005000',                            // total_cost_usd
    '0.005000',                            // actual_cost_usd
    '1200',                                // duration_ms
    '300',                                 // first_token_ms
    'true',                                // stream
    '192.168.1.1',                         // ip_address
    'Mozilla/5.0',                         // user_agent
  ].join(',');
}

const HEADER = [
  'billing_month', 'created_at', 'user_id', 'email', 'username',
  'api_key_id', 'api_key_name', 'request_id', 'model', 'inbound_endpoint',
  'upstream_endpoint', 'input_tokens', 'output_tokens', 'cache_creation_tokens',
  'cache_read_tokens', 'image_output_tokens', 'image_count', 'total_cost_usd',
  'actual_cost_usd', 'duration_ms', 'first_token_ms', 'stream', 'ip_address',
  'user_agent',
].join(',');

describe('streamRequestDetail', () => {
  let tempDir: string;
  let connection: DuckDBConnection;

  beforeEach(async () => {
    tempDir = makeTempDir();
    connection = await openRequestDetailDb();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    connection.closeSync();
  });

  it('should load a small CSV file and insert all records', async () => {
    const csvContent = [
      HEADER,
      makeRow('req-1', '2026-04'),
      makeRow('req-2', '2026-04'),
      makeRow('req-3', '2026-04'),
    ].join('\n');

    const filePath = join(tempDir, 'request_detail.csv');
    writeFileSync(filePath, csvContent);

    const result = await streamRequestDetail({
      filePath,
      folderName: '2026-04',
      connection,
      batchSize: 2, // Small batch to verify multi-batch processing
    });

    expect(result.recordsLoaded).toBe(3);
    expect(result.rowsRejected).toBe(0);
    expect(result.log).toHaveLength(0);

    // Verify records are in DuckDB.
    const page = await queryRequestDetail(connection, {
      billingMonth: '2026-04',
      pageSize: 10,
    });
    expect(page.totalCount).toBe(3);
    expect(page.records).toHaveLength(3);
  });

  it('should apply Billing_Month fallback from folder name', async () => {
    // Rows have empty billing_month — should be filled from folder name.
    const csvContent = [
      HEADER,
      makeRow('req-1', ''),
      makeRow('req-2', '  '),
    ].join('\n');

    const filePath = join(tempDir, 'request_detail.csv');
    writeFileSync(filePath, csvContent);

    const result = await streamRequestDetail({
      filePath,
      folderName: '2026-05',
      connection,
    });

    expect(result.recordsLoaded).toBe(2);

    const page = await queryRequestDetail(connection, {
      billingMonth: '2026-05',
      pageSize: 10,
    });
    expect(page.totalCount).toBe(2);
    expect(page.records[0]!.billing_month).toBe('2026-05');
    expect(page.records[1]!.billing_month).toBe('2026-05');
  });

  it('should reject invalid rows and report them in the log', async () => {
    const invalidRow = [
      '2026-04',                // billing_month
      '2026-04-10T12:00:00Z',  // created_at
      '',                       // user_id (required — empty = reject)
      'user@example.com',
      'testuser',
      'key-1',
      'My Key',
      'req-bad',
      'gpt-4o',
      '/v1/chat/completions',
      'https://api.openai.com/v1/chat/completions',
      '100', '50', '0', '0', '0', '0',
      '0.005000', '0.005000',
      '1200', '300', 'true',
      '192.168.1.1', 'Mozilla/5.0',
    ].join(',');

    const csvContent = [HEADER, makeRow('req-1', '2026-04'), invalidRow].join('\n');
    const filePath = join(tempDir, 'request_detail.csv');
    writeFileSync(filePath, csvContent);

    const result = await streamRequestDetail({
      filePath,
      folderName: '2026-04',
      connection,
    });

    expect(result.recordsLoaded).toBe(1);
    expect(result.rowsRejected).toBe(1);
    expect(result.log).toHaveLength(1);
    expect(result.log[0]!.type).toBe('rejected_row');
  });

  it('should handle an empty file (header only) gracefully', async () => {
    const csvContent = HEADER + '\n';
    const filePath = join(tempDir, 'request_detail.csv');
    writeFileSync(filePath, csvContent);

    const result = await streamRequestDetail({
      filePath,
      folderName: '2026-04',
      connection,
    });

    expect(result.recordsLoaded).toBe(0);
    expect(result.rowsRejected).toBe(0);
    expect(result.log).toHaveLength(0);
  });

  it('should process with configurable batch size', async () => {
    // Generate 10 rows, use batch size of 3 => 3 full batches + 1 partial batch.
    const rows = Array.from({ length: 10 }, (_, i) => makeRow(`req-${i}`, '2026-04'));
    const csvContent = [HEADER, ...rows].join('\n');
    const filePath = join(tempDir, 'request_detail.csv');
    writeFileSync(filePath, csvContent);

    const result = await streamRequestDetail({
      filePath,
      folderName: '2026-04',
      connection,
      batchSize: 3,
    });

    expect(result.recordsLoaded).toBe(10);
    expect(result.rowsRejected).toBe(0);

    const page = await queryRequestDetail(connection, {
      billingMonth: '2026-04',
      pageSize: 100,
    });
    expect(page.totalCount).toBe(10);
  });
});
