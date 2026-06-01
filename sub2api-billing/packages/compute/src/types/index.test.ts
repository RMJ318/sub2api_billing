import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  MODEL_FAMILIES,
  isInsufficientData,
  type ModelFamily,
  type MonthlySummaryRecord,
  type DailyUsageRecord,
  type ModelUsageRecord,
  type KeyUsageRecord,
  type RequestDetailRecord,
  type IngestionLogEntry,
  type IngestionSummary,
  type ForecastResult,
  type InsufficientData,
  type Signal,
  type RequestDetailQuery,
  type RequestDetailPage,
} from './index.js';

describe('shared record types and enums', () => {
  it('exposes the four model families in display order', () => {
    expect(MODEL_FAMILIES).toEqual<ModelFamily[]>(['GPT', 'Claude', 'Gemini', 'Other']);
  });

  it('distinguishes a forecast result from insufficient data', () => {
    const forecast: ForecastResult = {
      projectedMonthEndSpendUsd: new Decimal('123.456789'),
      projectedDaysToBudget: 12,
      overBudget: false,
    };
    const insufficient: InsufficientData = { insufficient: true };

    expect(isInsufficientData(forecast)).toBe(false);
    expect(isInsufficientData(insufficient)).toBe(true);
  });

  it('constructs a MonthlySummaryRecord with Decimal money, integer counts, tz Date, and nulls', () => {
    const summary: MonthlySummaryRecord = {
      billing_month: '2026-05',
      user_id: 'u1',
      email: null,
      username: 'alice',
      wechat: null,
      notes: null,
      role: 'user',
      status: 'active',
      current_balance_usd: new Decimal('566.069279'),
      monthly_limit_usd: new Decimal('1000'),
      used_usd: new Decimal('433.930721'),
      remaining_monthly_limit_usd: new Decimal('566.069279'),
      usage_percent: 43.4,
      request_count: 120,
      api_key_count: 2,
      active_days: 15,
      input_tokens: 1000,
      output_tokens: 2000,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      image_output_tokens: 0,
      image_count: 0,
      input_cost_usd: new Decimal('100'),
      output_cost_usd: new Decimal('200'),
      cache_creation_cost_usd: new Decimal('0'),
      cache_read_cost_usd: new Decimal('0'),
      image_output_cost_usd: new Decimal('0'),
      actual_cost_usd: new Decimal('433.930721'),
      avg_duration_ms: 1500,
      avg_first_token_ms: 250,
      first_request_at: new Date('2026-05-01T00:00:00Z'),
      last_request_at: new Date('2026-05-30T12:00:00Z'),
    };

    expect(summary.used_usd?.toFixed(6)).toBe('433.930721');
    expect(summary.first_request_at?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('constructs the remaining record types with their required fields', () => {
    const daily: DailyUsageRecord = {
      billing_month: '2026-05',
      usage_date: new Date('2026-05-02T00:00:00Z'),
      user_id: 'u1',
      email: null,
      username: null,
      request_count: 10,
      used_usd: new Decimal('1.5'),
      input_tokens: 100,
      output_tokens: 200,
      cache_read_tokens: 0,
      image_output_tokens: 0,
      avg_duration_ms: 900,
    };

    const model: ModelUsageRecord = {
      billing_month: '2026-05',
      user_id: 'u1',
      email: null,
      username: null,
      model: 'gpt-4o',
      request_count: 5,
      used_usd: new Decimal('0.75'),
      input_tokens: 50,
      output_tokens: 75,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      image_output_tokens: 0,
      avg_duration_ms: 800,
    };

    const key: KeyUsageRecord = {
      billing_month: '2026-05',
      user_id: 'u1',
      email: null,
      username: null,
      api_key_id: 'k1',
      api_key_name: 'prod',
      api_key_status: 'active',
      api_key_deleted: false,
      request_count: 5,
      used_usd: new Decimal('0.75'),
      input_tokens: 50,
      output_tokens: 75,
      first_request_at: new Date('2026-05-01T00:00:00Z'),
      last_request_at: new Date('2026-05-10T00:00:00Z'),
    };

    const detail: RequestDetailRecord = {
      billing_month: '2026-05',
      created_at: new Date('2026-05-01T01:02:03Z'),
      user_id: 'u1',
      email: null,
      username: null,
      api_key_id: 'k1',
      api_key_name: 'prod',
      request_id: 'r1',
      model: 'claude-3-5-sonnet',
      inbound_endpoint: '/v1/messages',
      upstream_endpoint: '/v1/messages',
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      image_output_tokens: 0,
      image_count: 0,
      total_cost_usd: new Decimal('0.001234'),
      actual_cost_usd: new Decimal('0.001234'),
      duration_ms: 500,
      first_token_ms: 120,
      stream: true,
      ip_address: '10.0.0.1',
      user_agent: 'curl/8.0',
    };

    expect(daily.usage_date.getUTCDate()).toBe(2);
    expect(model.model).toBe('gpt-4o');
    expect(key.api_key_deleted).toBe(false);
    expect(detail.stream).toBe(true);
  });

  it('constructs ingestion, signal, and query DTOs', () => {
    const summary: IngestionSummary = {
      foldersProcessed: 2,
      filesProcessed: 10,
      recordsLoaded: 1000,
      rowsRejected: 3,
    };
    const entries: IngestionLogEntry[] = [
      { type: 'skipped_folder', folder: '2026-03' },
      { type: 'missing_file', folder: '2026-04', file: 'request_detail.csv' },
      { type: 'access_error', path: '/billing', detail: 'EACCES' },
      {
        type: 'rejected_row',
        file: 'daily_user_usage.csv',
        rowNumber: 7,
        failures: [{ field: 'used_usd', rawValue: 'abc', reason: 'not a number' }],
      },
      { type: 'reconciliation', userId: 'u1', month: '2026-05', dailySum: '10', monthly: '11' },
      { type: 'unmatched_reference', requestId: 'r1', apiKeyId: 'k9', month: '2026-05' },
      { type: 'summary', summary },
    ];

    const signal: Signal = {
      id: 's1',
      group: 'high_spend',
      severity: 'critical',
      message: 'High single-day spend',
      target: { page: 'user', entityId: 'u1' },
      read: false,
    };

    const query: RequestDetailQuery = {
      billingMonth: '2026-05',
      sortBy: 'created_at',
      sortDir: 'desc',
      page: 1,
      pageSize: 100,
    };
    const page: RequestDetailPage = {
      records: [],
      totalCount: 0,
      totalPages: 0,
      page: 1,
      pageSize: 100,
    };

    expect(entries).toHaveLength(7);
    expect(signal.group).toBe('high_spend');
    expect(query.billingMonth).toBe('2026-05');
    expect(page.records).toEqual([]);
  });
});
