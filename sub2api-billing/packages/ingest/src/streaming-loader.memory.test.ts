/**
 * Integration test for bounded-memory streaming ingestion (task 15.6).
 *
 * Validates Requirement 3.1: The streaming loader processes `request_detail.csv`
 * in bounded-size increments such that peak memory consumption does not increase
 * proportionally with the total number of rows.
 *
 * Strategy:
 *  - Generate large CSV fixtures (1,000 and 10,000 rows).
 *  - Stream them through the loader with a small batch size (100).
 *  - Assert all records are successfully loaded into DuckDB.
 *  - Compare peak memory usage between the two runs and assert sublinear scaling
 *    (i.e. the 10x data increase does NOT cause a 10x memory increase).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openRequestDetailDb, queryRequestDetail } from '@core/store';
import type { DuckDBConnection } from '@duckdb/node-api';
import { streamRequestDetail } from './streaming-loader.js';

const HEADER = [
  'billing_month', 'created_at', 'user_id', 'email', 'username',
  'api_key_id', 'api_key_name', 'request_id', 'model', 'inbound_endpoint',
  'upstream_endpoint', 'input_tokens', 'output_tokens', 'cache_creation_tokens',
  'cache_read_tokens', 'image_output_tokens', 'image_count', 'total_cost_usd',
  'actual_cost_usd', 'duration_ms', 'first_token_ms', 'stream', 'ip_address',
  'user_agent',
].join(',');

/** Generate a valid request_detail CSV row with a unique request_id. */
function makeRow(index: number): string {
  return [
    '2026-04',                             // billing_month
    '2026-04-10T12:00:00Z',               // created_at
    `user-${(index % 50) + 1}`,           // user_id (50 distinct users)
    `user${index}@example.com`,            // email
    `testuser-${index}`,                   // username
    `key-${(index % 10) + 1}`,            // api_key_id (10 distinct keys)
    `Key ${(index % 10) + 1}`,            // api_key_name
    `req-${randomUUID()}`,                 // request_id (unique)
    ['gpt-4o', 'claude-3-opus', 'gemini-pro', 'gpt-3.5-turbo'][index % 4], // model
    '/v1/chat/completions',                // inbound_endpoint
    'https://api.openai.com/v1/chat/completions', // upstream_endpoint
    String(100 + (index % 500)),           // input_tokens
    String(50 + (index % 200)),            // output_tokens
    '0',                                   // cache_creation_tokens
    '0',                                   // cache_read_tokens
    '0',                                   // image_output_tokens
    '0',                                   // image_count
    (0.001 * (index % 100) + 0.001).toFixed(6), // total_cost_usd
    (0.001 * (index % 100) + 0.001).toFixed(6), // actual_cost_usd
    String(500 + (index % 2000)),          // duration_ms
    String(100 + (index % 500)),           // first_token_ms
    index % 2 === 0 ? 'true' : 'false',   // stream
    '192.168.1.1',                         // ip_address
    'Mozilla/5.0',                         // user_agent
  ].join(',');
}

/** Create a temp directory for test fixtures. */
function makeTempDir(): string {
  const dir = join(tmpdir(), `streaming-memory-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Generate a CSV fixture file with the given number of rows. */
function generateFixture(dir: string, rowCount: number, filename: string): string {
  const filePath = join(dir, filename);
  const lines = [HEADER];
  for (let i = 0; i < rowCount; i++) {
    lines.push(makeRow(i));
  }
  writeFileSync(filePath, lines.join('\n'));
  return filePath;
}

/**
 * Measure peak RSS memory used during a streaming load operation.
 * Forces GC before and monitors memory during the load.
 */
async function measurePeakMemoryDuringLoad(
  filePath: string,
  connection: DuckDBConnection,
  batchSize: number,
): Promise<{ result: Awaited<ReturnType<typeof streamRequestDetail>>; peakRssBytes: number }> {
  // Force GC if available to get a cleaner baseline.
  if (global.gc) {
    global.gc();
  }

  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;

  // Sample memory usage periodically during the streaming operation.
  const interval = setInterval(() => {
    const current = process.memoryUsage().rss;
    if (current > peakRss) {
      peakRss = current;
    }
  }, 5);

  const result = await streamRequestDetail({
    filePath,
    folderName: '2026-04',
    connection,
    batchSize,
  });

  clearInterval(interval);

  // One final measurement after completion.
  const finalRss = process.memoryUsage().rss;
  if (finalRss > peakRss) {
    peakRss = finalRss;
  }

  return { result, peakRssBytes: peakRss - baselineRss };
}

describe('streamRequestDetail - bounded memory (Requirement 3.1)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load 10,000 rows and insert all records into DuckDB', async () => {
    const ROW_COUNT = 10_000;
    const BATCH_SIZE = 100;
    const filePath = generateFixture(tempDir, ROW_COUNT, 'request_detail_large.csv');

    const connection = await openRequestDetailDb();
    try {
      const result = await streamRequestDetail({
        filePath,
        folderName: '2026-04',
        connection,
        batchSize: BATCH_SIZE,
      });

      // All records should be loaded successfully.
      expect(result.recordsLoaded).toBe(ROW_COUNT);
      expect(result.rowsRejected).toBe(0);
      expect(result.log).toHaveLength(0);

      // Verify all records are queryable in DuckDB.
      const page = await queryRequestDetail(connection, {
        billingMonth: '2026-04',
        pageSize: 1,
      });
      expect(page.totalCount).toBe(ROW_COUNT);
    } finally {
      connection.closeSync();
    }
  });

  it('should have peak memory that does not scale linearly with row count', { timeout: 60_000 }, async () => {
    const SMALL_COUNT = 1_000;
    const LARGE_COUNT = 10_000;
    const BATCH_SIZE = 100;

    // Generate fixtures.
    const smallFile = generateFixture(tempDir, SMALL_COUNT, 'small.csv');
    const largeFile = generateFixture(tempDir, LARGE_COUNT, 'large.csv');

    // --- Run 1: Stream 1,000 rows ---
    const connSmall = await openRequestDetailDb();
    let smallPeak: number;
    try {
      const { result: smallResult, peakRssBytes } = await measurePeakMemoryDuringLoad(
        smallFile,
        connSmall,
        BATCH_SIZE,
      );
      smallPeak = peakRssBytes;
      expect(smallResult.recordsLoaded).toBe(SMALL_COUNT);
      expect(smallResult.rowsRejected).toBe(0);
    } finally {
      connSmall.closeSync();
    }

    // --- Run 2: Stream 10,000 rows ---
    const connLarge = await openRequestDetailDb();
    let largePeak: number;
    try {
      const { result: largeResult, peakRssBytes } = await measurePeakMemoryDuringLoad(
        largeFile,
        connLarge,
        BATCH_SIZE,
      );
      largePeak = peakRssBytes;
      expect(largeResult.recordsLoaded).toBe(LARGE_COUNT);
      expect(largeResult.rowsRejected).toBe(0);
    } finally {
      connLarge.closeSync();
    }

    // --- Memory scaling assertion ---
    // With 10x more data, if memory scaled linearly we'd expect ~10x the peak.
    // With bounded streaming (batch size 100), peak memory should be sublinear.
    // We allow up to 5x increase for a 10x data increase as a generous bound
    // (accounting for DuckDB internal buffers, Node.js GC timing, etc.).
    // A truly linear approach would use ~10x memory.
    const ratio = largePeak / Math.max(smallPeak, 1);

    // The ratio should be well below 10 (the linear scaling factor).
    // We use 5 as a generous upper bound to avoid flaky tests from GC variance.
    expect(ratio).toBeLessThan(5);
  });
});
