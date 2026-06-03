/**
 * Unit tests for the ingestion orchestration (task 15.3).
 *
 * Uses a temp directory to simulate various folder discovery scenarios:
 * - All five files present: records are loaded, no skipped/missing entries.
 * - Skipped folder: folder has no expected files -> skipped_folder log entry.
 * - Missing files: folder has some but not all expected files -> missing_file
 *   log entries.
 * - Access error on root: root unreadable -> access_error log entry + halt.
 * - Reconciliation and unmatched-reference entries.
 * - Final ingestion summary with correct counts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { InMemoryRecordStore } from '@core/store';
import type { IngestionConfig } from '@core/compute';

import { runIngestion, EXPECTED_FILES } from './ingestion-orchestrator.js';

/** Minimal valid CSV content for monthly_user_summary.csv */
const MONTHLY_SUMMARY_CSV = `billing_month,user_id,email,username,used_usd,monthly_limit_usd,request_count,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,image_output_tokens,image_count,api_key_count
2026-04,user1,user1@test.com,alice,100.50,1000,50,1000,500,0,0,0,0,2
2026-04,user2,user2@test.com,bob,200.75,1000,30,2000,1000,0,0,0,0,1
`;

/** Minimal valid CSV content for daily_user_usage.csv */
const DAILY_USAGE_CSV = `billing_month,usage_date,user_id,email,username,request_count,used_usd,input_tokens,output_tokens,cache_read_tokens,image_output_tokens,avg_duration_ms
2026-04,2026-04-01T00:00:00Z,user1,user1@test.com,alice,10,20.10,100,50,0,0,150
2026-04,2026-04-02T00:00:00Z,user1,user1@test.com,alice,15,30.20,200,100,0,0,120
2026-04,2026-04-01T00:00:00Z,user2,user2@test.com,bob,20,100.50,500,200,0,0,200
`;

/** Minimal valid CSV content for model_user_usage.csv */
const MODEL_USAGE_CSV = `billing_month,user_id,email,username,model,request_count,used_usd,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,image_output_tokens,avg_duration_ms
2026-04,user1,user1@test.com,alice,gpt-4,30,80.00,800,400,0,0,0,150
2026-04,user2,user2@test.com,bob,claude-3,20,150.00,1500,700,0,0,0,200
`;

/** Minimal valid CSV content for api_key_usage.csv */
const KEY_USAGE_CSV = `billing_month,user_id,email,username,api_key_id,api_key_name,api_key_status,api_key_deleted,request_count,used_usd,input_tokens,output_tokens,first_request_at,last_request_at
2026-04,user1,user1@test.com,alice,key1,Production Key,active,false,30,80.00,800,400,2026-04-01T00:00:00Z,2026-04-15T00:00:00Z
2026-04,user2,user2@test.com,bob,key2,Dev Key,active,false,20,150.00,1500,700,2026-04-01T00:00:00Z,2026-04-10T00:00:00Z
`;

/** Minimal valid CSV content for request_detail.csv */
const REQUEST_DETAIL_CSV = `billing_month,created_at,user_id,email,username,api_key_id,api_key_name,request_id,model,total_cost_usd,duration_ms,stream
2026-04,2026-04-01T10:00:00Z,user1,user1@test.com,alice,key1,Production Key,req1,gpt-4,2.50,150,true
2026-04,2026-04-02T11:00:00Z,user2,user2@test.com,bob,key2,Dev Key,req2,claude-3,5.00,200,false
`;

/** Request detail referencing an api_key_id NOT in key_usage -> unmatched reference */
const REQUEST_DETAIL_UNMATCHED_CSV = `billing_month,created_at,user_id,email,username,api_key_id,api_key_name,request_id,model,total_cost_usd,duration_ms,stream
2026-04,2026-04-01T10:00:00Z,user1,user1@test.com,alice,key1,Production Key,req1,gpt-4,2.50,150,true
2026-04,2026-04-02T11:00:00Z,user2,user2@test.com,bob,unknown_key,Unknown,req2,claude-3,5.00,200,false
`;

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'ingest-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function defaultConfig(rootDir: string): IngestionConfig {
  return { billingRootDir: rootDir, requestDetailBatchSize: 10_000 };
}

describe('runIngestion', () => {
  it('should halt with access_error when root is unreadable', async () => {
    const store = new InMemoryRecordStore();
    const config = defaultConfig(join(tempDir, 'nonexistent-root'));

    const result = await runIngestion(config, store);

    expect(result.summary.foldersProcessed).toBe(0);
    expect(result.summary.filesProcessed).toBe(0);
    expect(result.summary.recordsLoaded).toBe(0);
    expect(result.summary.rowsRejected).toBe(0);

    const accessErrors = result.log.filter((e) => e.type === 'access_error');
    expect(accessErrors.length).toBe(1);
    expect(accessErrors[0]!.type === 'access_error' && accessErrors[0]!.path).toContain(
      'nonexistent-root',
    );

    // Should still have a summary entry.
    const summaryEntries = result.log.filter((e) => e.type === 'summary');
    expect(summaryEntries.length).toBe(1);
  });

  it('should skip non-YYYY-MM folders', async () => {
    // Create an invalid folder name.
    await mkdir(join(tempDir, 'not-a-month'));
    await mkdir(join(tempDir, '2026-13')); // invalid month
    await mkdir(join(tempDir, 'random'));

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    expect(result.summary.foldersProcessed).toBe(0);
    // No skipped_folder entries because these don't match YYYY-MM.
    const skipped = result.log.filter((e) => e.type === 'skipped_folder');
    expect(skipped.length).toBe(0);
  });

  it('should record skipped_folder when no expected files are present', async () => {
    const folderPath = join(tempDir, '2026-04');
    await mkdir(folderPath);
    // Only create a non-expected file.
    await writeFile(join(folderPath, 'README.txt'), 'Hello');

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    expect(result.summary.foldersProcessed).toBe(0);
    const skipped = result.log.filter((e) => e.type === 'skipped_folder');
    expect(skipped.length).toBe(1);
    expect(skipped[0]!.type === 'skipped_folder' && skipped[0]!.folder).toBe('2026-04');
  });

  it('should record missing_file entries when some but not all files present', async () => {
    const folderPath = join(tempDir, '2026-04');
    await mkdir(folderPath);
    // Only write 2 of the 5 expected files.
    await writeFile(join(folderPath, 'monthly_user_summary.csv'), MONTHLY_SUMMARY_CSV);
    await writeFile(join(folderPath, 'daily_user_usage.csv'), DAILY_USAGE_CSV);

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    expect(result.summary.foldersProcessed).toBe(1);
    expect(result.summary.filesProcessed).toBe(2);

    const missing = result.log.filter((e) => e.type === 'missing_file');
    // 3 missing files: model_user_usage, api_key_usage, request_detail
    expect(missing.length).toBe(3);
    const missingFileNames = missing.map((e) =>
      e.type === 'missing_file' ? e.file : '',
    );
    expect(missingFileNames).toContain('model_user_usage.csv');
    expect(missingFileNames).toContain('api_key_usage.csv');
    expect(missingFileNames).toContain('request_detail.csv');
  });

  it('should process all five files and produce correct summary counts', async () => {
    const folderPath = join(tempDir, '2026-04');
    await mkdir(folderPath);
    await writeFile(join(folderPath, 'monthly_user_summary.csv'), MONTHLY_SUMMARY_CSV);
    await writeFile(join(folderPath, 'daily_user_usage.csv'), DAILY_USAGE_CSV);
    await writeFile(join(folderPath, 'model_user_usage.csv'), MODEL_USAGE_CSV);
    await writeFile(join(folderPath, 'api_key_usage.csv'), KEY_USAGE_CSV);
    await writeFile(join(folderPath, 'request_detail.csv'), REQUEST_DETAIL_CSV);

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    expect(result.summary.foldersProcessed).toBe(1);
    expect(result.summary.filesProcessed).toBe(5);
    // 2 monthly + 3 daily + 2 model + 2 key + 2 request_detail = 11
    expect(result.summary.recordsLoaded).toBe(11);
    expect(result.summary.rowsRejected).toBe(0);

    // Verify records were loaded into the store.
    expect(store.monthlySummaries('2026-04').length).toBe(2);
    expect(store.dailyUsage('2026-04').length).toBe(3);
    expect(store.modelUsage('2026-04').length).toBe(2);
    expect(store.keyUsage('2026-04').length).toBe(2);
    expect(store.availableMonths()).toEqual(['2026-04']);
  });

  it('should handle multiple billing month folders', async () => {
    // Create two month folders with minimal data.
    const folder1 = join(tempDir, '2026-04');
    const folder2 = join(tempDir, '2026-05');
    await mkdir(folder1);
    await mkdir(folder2);
    await writeFile(join(folder1, 'monthly_user_summary.csv'), MONTHLY_SUMMARY_CSV);
    await writeFile(
      join(folder2, 'monthly_user_summary.csv'),
      MONTHLY_SUMMARY_CSV.replace(/2026-04/g, '2026-05'),
    );

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    expect(result.summary.foldersProcessed).toBe(2);
    expect(store.availableMonths()).toEqual(['2026-04', '2026-05']);
  });

  it('should run reconciliation and detect daily-vs-monthly mismatch', async () => {
    const folderPath = join(tempDir, '2026-04');
    await mkdir(folderPath);

    // Monthly says user1 used 100.50, but daily sums to 50.30 (>1% diff).
    await writeFile(join(folderPath, 'monthly_user_summary.csv'), MONTHLY_SUMMARY_CSV);
    await writeFile(join(folderPath, 'daily_user_usage.csv'), DAILY_USAGE_CSV);

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    // Should have reconciliation entries since daily sum != monthly used_usd.
    const reconEntries = result.log.filter((e) => e.type === 'reconciliation');
    // user1: daily=20.10+30.20=50.30 vs monthly=100.50 -> >1% mismatch
    // user2: daily=100.50 vs monthly=200.75 -> >1% mismatch
    expect(reconEntries.length).toBeGreaterThan(0);
  });

  it('should detect unmatched API key references', async () => {
    const folderPath = join(tempDir, '2026-04');
    await mkdir(folderPath);
    await writeFile(join(folderPath, 'api_key_usage.csv'), KEY_USAGE_CSV);
    await writeFile(join(folderPath, 'request_detail.csv'), REQUEST_DETAIL_UNMATCHED_CSV);

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    const unmatchedEntries = result.log.filter((e) => e.type === 'unmatched_reference');
    expect(unmatchedEntries.length).toBe(1);
    expect(
      unmatchedEntries[0]!.type === 'unmatched_reference' &&
        unmatchedEntries[0]!.apiKeyId,
    ).toBe('unknown_key');
  });

  it('should record rejected rows with bad data', async () => {
    const folderPath = join(tempDir, '2026-04');
    await mkdir(folderPath);

    // CSV with an invalid monetary value.
    const badCsv = `billing_month,user_id,email,username,used_usd,monthly_limit_usd,request_count,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,image_output_tokens,image_count,api_key_count
2026-04,user1,user1@test.com,alice,not_a_number,1000,50,1000,500,0,0,0,0,2
2026-04,user2,user2@test.com,bob,200.75,1000,30,2000,1000,0,0,0,0,1
`;
    await writeFile(join(folderPath, 'monthly_user_summary.csv'), badCsv);

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    expect(result.summary.rowsRejected).toBe(1);
    expect(result.summary.recordsLoaded).toBe(1); // Only user2 is valid.
    const rejectedEntries = result.log.filter((e) => e.type === 'rejected_row');
    expect(rejectedEntries.length).toBe(1);
  });

  it('should always end with a summary log entry', async () => {
    const folderPath = join(tempDir, '2026-04');
    await mkdir(folderPath);
    await writeFile(join(folderPath, 'monthly_user_summary.csv'), MONTHLY_SUMMARY_CSV);

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    // The last log entry should be the summary.
    const lastEntry = result.log[result.log.length - 1];
    expect(lastEntry?.type).toBe('summary');
    if (lastEntry?.type === 'summary') {
      expect(lastEntry.summary).toEqual(result.summary);
    }
  });

  it('should fill billing_month from folder name when record has empty billing_month', async () => {
    const folderPath = join(tempDir, '2026-04');
    await mkdir(folderPath);

    // CSV where billing_month column is empty.
    const csvWithEmptyMonth = `billing_month,user_id,email,username,used_usd,monthly_limit_usd,request_count,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,image_output_tokens,image_count,api_key_count
,user1,user1@test.com,alice,100.50,1000,50,1000,500,0,0,0,0,2
`;
    await writeFile(join(folderPath, 'monthly_user_summary.csv'), csvWithEmptyMonth);

    const store = new InMemoryRecordStore();
    const config = defaultConfig(tempDir);

    const result = await runIngestion(config, store);

    expect(result.summary.recordsLoaded).toBe(1);
    const records = store.monthlySummaries('2026-04');
    expect(records.length).toBe(1);
    expect(records[0]!.billing_month).toBe('2026-04');
  });
});
