import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { parseCsv, parseRow } from './row-parser.js';
import {
  monthlySummarySchema,
  dailyUsageSchema,
  modelUsageSchema,
  keyUsageSchema,
  requestDetailSchema,
} from './schemas.js';
import type { MonthlySummaryRecord, RequestDetailRecord } from '../types/records.js';

describe('parseCsv header mapping and RFC 4180 quoting (Req 2.1, 2.2)', () => {
  it('maps columns by header name regardless of column order', () => {
    // Header order differs from the schema's documented order.
    const csv = ['user_id,used_usd,billing_month', '7,433.930721,2026-05'].join('\n');
    const { records } = parseCsv<MonthlySummaryRecord>(csv, monthlySummarySchema);
    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.user_id).toBe('7');
    expect(rec.billing_month).toBe('2026-05');
    expect(rec.used_usd).toBeInstanceOf(Decimal);
    expect((rec.used_usd as Decimal).toString()).toBe('433.930721');
  });

  it('parses quoted fields containing commas, quotes, and newlines (Req 2.2)', () => {
    const csv = [
      'user_id,api_key_id,request_id,user_agent',
      '1,1,abc,"Mozilla, ""X""\nline2"',
    ].join('\n');
    const { records } = parseCsv<RequestDetailRecord>(csv, requestDetailSchema);
    expect(records).toHaveLength(1);
    expect(records[0]!.user_agent).toBe('Mozilla, "X"\nline2');
  });

  it('treats empty quoted values as empty -> null for optional fields (Req 2.2, 2.8)', () => {
    const csv = ['user_id,model,username', '1,gpt-5.5,""'].join('\n');
    const { records } = parseCsv(csv, modelUsageSchema);
    expect(records[0]!.username).toBeNull();
  });
});

describe('codec application and null defaults (Req 2.3-2.8)', () => {
  it('applies per-column codecs to produce typed values', () => {
    const csv = [
      'billing_month,usage_date,user_id,request_count,used_usd,avg_duration_ms',
      '2026-05,2026-05-22,19,156,35.375410,41314.81',
    ].join('\n');
    const { records } = parseCsv(csv, dailyUsageSchema);
    const rec = records[0]!;
    expect(rec.usage_date).toBeInstanceOf(Date);
    expect(rec.usage_date.toISOString()).toBe('2026-05-22T00:00:00.000Z');
    expect(rec.request_count).toBe(156);
    expect((rec.used_usd as Decimal).toString()).toBe('35.37541');
    expect(rec.avg_duration_ms).toBe(41314.81);
  });

  it('stores null for empty non-required fields (Req 2.8)', () => {
    const csv = [
      'billing_month,user_id,used_usd,request_count,first_request_at',
      '2026-05,7,,,',
    ].join('\n');
    const { records } = parseCsv<MonthlySummaryRecord>(csv, monthlySummarySchema);
    const rec = records[0]!;
    expect(rec.used_usd).toBeNull();
    expect(rec.request_count).toBeNull();
    expect(rec.first_request_at).toBeNull();
  });

  it('parses api_key_deleted boolean tokens (Req 2.6)', () => {
    const csv = ['user_id,api_key_id,api_key_deleted', '1,23,f'].join('\n');
    const { records } = parseCsv(csv, keyUsageSchema);
    expect(records[0]!.api_key_deleted).toBe(false);
  });
});

describe('required-field enforcement per record type (Req 2.10)', () => {
  it('rejects a monthly summary row with an empty user_id', () => {
    const csv = ['billing_month,user_id', '2026-05,'].join('\n');
    const { records, rows } = parseCsv(csv, monthlySummarySchema);
    expect(records).toHaveLength(0);
    expect(rows[0]!.failures.some((f) => f.field === 'user_id')).toBe(true);
  });

  it('requires usage_date for daily, model for model usage, api_key_id for key, request_id for detail', () => {
    const daily = parseCsv('user_id,usage_date\n7,\n', dailyUsageSchema);
    expect(daily.rows[0]!.failures.some((f) => f.field === 'usage_date')).toBe(true);

    const model = parseCsv('user_id,model\n7,\n', modelUsageSchema);
    expect(model.rows[0]!.failures.some((f) => f.field === 'model')).toBe(true);

    const key = parseCsv('user_id,api_key_id\n7,\n', keyUsageSchema);
    expect(key.rows[0]!.failures.some((f) => f.field === 'api_key_id')).toBe(true);

    const detail = parseCsv('user_id,api_key_id,request_id\n7,3,\n', requestDetailSchema);
    expect(detail.rows[0]!.failures.some((f) => f.field === 'request_id')).toBe(true);
  });

  it('accepts a row whose only-required field is present even if optionals are empty', () => {
    const csv = ['user_id,used_usd', '7,'].join('\n');
    const { records } = parseCsv(csv, monthlySummarySchema);
    expect(records).toHaveLength(1);
    expect(records[0]!.user_id).toBe('7');
  });
});

describe('failure aggregation: evaluate all remaining fields then reject (Req 2.9)', () => {
  it('records every failing field with its raw value, not just the first', () => {
    const csv = [
      'user_id,used_usd,request_count,usage_percent',
      // user_id ok; used_usd bad; request_count bad (negative); usage_percent bad.
      '7,abc,-3,not-a-number',
    ].join('\n');
    const { records, rows } = parseCsv(csv, monthlySummarySchema);
    expect(records).toHaveLength(0);

    const failing = rows[0]!;
    const fields = failing.failures.map((f) => f.field).sort();
    expect(fields).toEqual(['request_count', 'usage_percent', 'used_usd']);

    const byField = new Map(failing.failures.map((f) => [f.field, f.rawValue]));
    expect(byField.get('used_usd')).toBe('abc');
    expect(byField.get('request_count')).toBe('-3');
    expect(byField.get('usage_percent')).toBe('not-a-number');
  });

  it('reports an empty required field and a bad conversion together', () => {
    const csv = ['user_id,model,used_usd', ',gpt-5.5,xyz'].join('\n');
    const { rows } = parseCsv(csv, modelUsageSchema);
    const fields = rows[0]!.failures.map((f) => f.field).sort();
    expect(fields).toEqual(['used_usd', 'user_id']);
  });
});

describe('row numbering and multi-row files', () => {
  it('reports 1-based data row numbers (header excluded)', () => {
    const csv = [
      'user_id,used_usd',
      '7,1.5', // row 1 (valid)
      '8,bad', // row 2 (invalid)
      '9,2.5', // row 3 (valid)
    ].join('\n');
    const { records, rows } = parseCsv(csv, monthlySummarySchema);
    expect(records).toHaveLength(2);
    const rejected = rows.find((r) => r.failures.length > 0)!;
    expect(rejected.rowNumber).toBe(2);
  });

  it('skips blank lines between records', () => {
    const csv = ['user_id,used_usd', '7,1.5', '', '8,2.5', ''].join('\n');
    const { records } = parseCsv(csv, monthlySummarySchema);
    expect(records).toHaveLength(2);
  });

  it('handles an empty document (header only or nothing)', () => {
    expect(parseCsv('', monthlySummarySchema).records).toHaveLength(0);
    expect(parseCsv('user_id,used_usd\n', monthlySummarySchema).records).toHaveLength(0);
  });
});

describe('parseRow direct use', () => {
  it('maps by header index and tolerates short rows (missing trailing columns -> empty)', () => {
    const header = ['user_id', 'model', 'used_usd'];
    // Short row: only user_id and model present; used_usd missing -> null.
    const result = parseRow(['7', 'gpt-5.5'], header, modelUsageSchema, 1);
    expect(result.failures).toHaveLength(0);
    expect(result.record?.user_id).toBe('7');
    expect(result.record?.model).toBe('gpt-5.5');
    expect(result.record?.used_usd).toBeNull();
  });
});
