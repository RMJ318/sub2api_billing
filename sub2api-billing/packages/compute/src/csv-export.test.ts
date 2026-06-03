import { describe, it, expect } from 'vitest';
import { buildCsvExport } from './csv-export.js';

describe('buildCsvExport', () => {
  const fixedTimestamp = 1719849600000; // deterministic timestamp for tests

  it('produces a header row followed by data rows using the column order', () => {
    const result = buildCsvExport(
      {
        pageName: 'dashboard',
        billingMonth: '2026-04',
        columns: ['user_id', 'used_usd', 'request_count'],
        rows: [
          { user_id: 'alice', used_usd: '12.50', request_count: 100 },
          { user_id: 'bob', used_usd: '7.25', request_count: 50 },
        ],
      },
      fixedTimestamp,
    );

    const lines = result.content.split('\r\n');
    expect(lines[0]).toBe('user_id,used_usd,request_count');
    expect(lines[1]).toBe('alice,12.50,100');
    expect(lines[2]).toBe('bob,7.25,50');
  });

  it('generates filename in the format pageName_billingMonth_timestamp.csv', () => {
    const result = buildCsvExport(
      {
        pageName: 'user-analysis',
        billingMonth: '2026-05',
        columns: ['col1'],
        rows: [],
      },
      fixedTimestamp,
    );

    expect(result.filename).toBe(`user-analysis_2026-05_${fixedTimestamp}.csv`);
  });

  it('produces header-only content when rows are empty (Req 20.5)', () => {
    const result = buildCsvExport(
      {
        pageName: 'cost',
        billingMonth: '2026-04',
        columns: ['user_id', 'model', 'spend'],
        rows: [],
      },
      fixedTimestamp,
    );

    expect(result.content).toBe('user_id,model,spend\r\n');
  });

  it('applies RFC 4180 quoting for fields containing commas or quotes', () => {
    const result = buildCsvExport(
      {
        pageName: 'model',
        billingMonth: '2026-04',
        columns: ['name', 'notes'],
        rows: [{ name: 'gpt-4', notes: 'fast, accurate' }],
      },
      fixedTimestamp,
    );

    const lines = result.content.split('\r\n');
    expect(lines[1]).toBe('gpt-4,"fast, accurate"');
  });

  it('handles null and undefined values as empty fields', () => {
    const result = buildCsvExport(
      {
        pageName: 'keys',
        billingMonth: '2026-04',
        columns: ['key_id', 'name', 'status'],
        rows: [{ key_id: 'k1', name: null, status: undefined }],
      },
      fixedTimestamp,
    );

    const lines = result.content.split('\r\n');
    expect(lines[1]).toBe('k1,,');
  });

  it('uses Date.now() when no timestamp is provided', () => {
    const before = Date.now();
    const result = buildCsvExport({
      pageName: 'dashboard',
      billingMonth: '2026-04',
      columns: ['a'],
      rows: [],
    });
    const after = Date.now();

    // Extract the timestamp from the filename
    const match = result.filename.match(/^dashboard_2026-04_(\d+)\.csv$/);
    expect(match).not.toBeNull();
    const ts = Number(match![1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
