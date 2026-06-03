import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import { reconcileDailyToMonthly, detectUnmatchedReferences } from './index.js';
import type { DailyUsageRecord, MonthlySummaryRecord, KeyUsageRecord, RequestDetailRecord } from './index.js';

/**
 * Unit tests for reconciliation and unmatched-reference detection
 * (Requirements 21.1, 21.2, 21.3).
 */

// --- Helpers ---

function makeDailyRecord(overrides: Partial<DailyUsageRecord> & { user_id: string; billing_month: string }): DailyUsageRecord {
  return {
    usage_date: new Date('2026-04-01T00:00:00Z'),
    email: null,
    username: null,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
    ...overrides,
  };
}

function makeSummaryRecord(overrides: Partial<MonthlySummaryRecord> & { user_id: string; billing_month: string }): MonthlySummaryRecord {
  return {
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: null,
    used_usd: null,
    remaining_monthly_limit_usd: null,
    usage_percent: null,
    request_count: null,
    api_key_count: null,
    active_days: null,
    input_tokens: null,
    output_tokens: null,
    cache_creation_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    image_count: null,
    input_cost_usd: null,
    output_cost_usd: null,
    cache_creation_cost_usd: null,
    cache_read_cost_usd: null,
    image_output_cost_usd: null,
    actual_cost_usd: null,
    avg_duration_ms: null,
    avg_first_token_ms: null,
    first_request_at: null,
    last_request_at: null,
    ...overrides,
  };
}

function makeKeyRecord(overrides: Partial<KeyUsageRecord> & { api_key_id: string; user_id: string; billing_month: string }): KeyUsageRecord {
  return {
    email: null,
    username: null,
    api_key_name: null,
    api_key_status: null,
    api_key_deleted: null,
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    first_request_at: null,
    last_request_at: null,
    ...overrides,
  };
}

function makeRequestDetail(overrides: Partial<RequestDetailRecord> & { request_id: string; api_key_id: string; user_id: string; billing_month: string }): RequestDetailRecord {
  return {
    created_at: null,
    email: null,
    username: null,
    api_key_name: null,
    model: null,
    inbound_endpoint: null,
    upstream_endpoint: null,
    input_tokens: null,
    output_tokens: null,
    cache_creation_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    image_count: null,
    total_cost_usd: null,
    actual_cost_usd: null,
    duration_ms: null,
    first_token_ms: null,
    stream: null,
    ip_address: null,
    user_agent: null,
    ...overrides,
  };
}

// --- reconcileDailyToMonthly ---

describe('reconcileDailyToMonthly', () => {
  it('returns no discrepancies when daily sums match the monthly summary (Req 21.1, 21.2)', () => {
    const daily: DailyUsageRecord[] = [
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('50.00'), usage_date: new Date('2026-04-01') }),
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('50.00'), usage_date: new Date('2026-04-02') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
    ];

    const result = reconcileDailyToMonthly(daily, summary);
    expect(result.discrepancies).toHaveLength(0);
    expect(result.logEntries).toHaveLength(0);
  });

  it('flags a mismatch when daily sum differs by more than 1% (Req 21.2)', () => {
    const daily: DailyUsageRecord[] = [
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('90.00'), usage_date: new Date('2026-04-01') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
    ];

    const result = reconcileDailyToMonthly(daily, summary);
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].userId).toBe('u1');
    expect(result.discrepancies[0].month).toBe('2026-04');
    expect(result.discrepancies[0].dailySumUsd.equals(new Decimal('90'))).toBe(true);
    expect(result.discrepancies[0].monthlySummaryUsd.equals(new Decimal('100'))).toBe(true);
    expect(result.discrepancies[0].differencePercent).toBe(10);
  });

  it('does not flag a mismatch at exactly 1% (threshold is >, not >=)', () => {
    // 99 vs 100 = 1% difference exactly — should not be flagged.
    const daily: DailyUsageRecord[] = [
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('99.00'), usage_date: new Date('2026-04-01') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
    ];

    const result = reconcileDailyToMonthly(daily, summary);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('flags when daily sum exceeds the monthly summary by more than 1%', () => {
    const daily: DailyUsageRecord[] = [
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('110.00'), usage_date: new Date('2026-04-01') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
    ];

    const result = reconcileDailyToMonthly(daily, summary);
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].differencePercent).toBe(10);
  });

  it('skips users with null monthly used_usd', () => {
    const daily: DailyUsageRecord[] = [
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('50.00'), usage_date: new Date('2026-04-01') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: null }),
    ];

    const result = reconcileDailyToMonthly(daily, summary);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('skips users with zero monthly used_usd (relative diff undefined)', () => {
    const daily: DailyUsageRecord[] = [
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('5.00'), usage_date: new Date('2026-04-01') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('0') }),
    ];

    const result = reconcileDailyToMonthly(daily, summary);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('handles multiple users and only flags those with a mismatch', () => {
    const daily: DailyUsageRecord[] = [
      // u1: sum = 100, monthly = 100 (exact match)
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00'), usage_date: new Date('2026-04-01') }),
      // u2: sum = 80, monthly = 100 (20% off)
      makeDailyRecord({ user_id: 'u2', billing_month: '2026-04', used_usd: new Decimal('80.00'), usage_date: new Date('2026-04-01') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
      makeSummaryRecord({ user_id: 'u2', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
    ];

    const result = reconcileDailyToMonthly(daily, summary);
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].userId).toBe('u2');
  });

  it('treats missing daily records for a user as a zero sum', () => {
    // User in summary but no daily records — sum is 0, which is 100% off from 100.
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
    ];

    const result = reconcileDailyToMonthly([], summary);
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].differencePercent).toBe(100);
  });

  it('produces ingestion log entries matching the discrepancies', () => {
    const daily: DailyUsageRecord[] = [
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('50.00'), usage_date: new Date('2026-04-01') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
    ];

    const result = reconcileDailyToMonthly(daily, summary);
    expect(result.logEntries).toHaveLength(1);
    expect(result.logEntries[0]).toEqual({
      type: 'reconciliation',
      userId: 'u1',
      month: '2026-04',
      dailySum: '50',
      monthly: '100',
    });
  });

  it('supports a custom threshold percentage', () => {
    const daily: DailyUsageRecord[] = [
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('96.00'), usage_date: new Date('2026-04-01') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
    ];

    // 4% diff; default threshold (1%) would flag, but 5% threshold does not.
    const result = reconcileDailyToMonthly(daily, summary, 5);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('ignores daily records with null used_usd', () => {
    const daily: DailyUsageRecord[] = [
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: null, usage_date: new Date('2026-04-01') }),
      makeDailyRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00'), usage_date: new Date('2026-04-02') }),
    ];
    const summary: MonthlySummaryRecord[] = [
      makeSummaryRecord({ user_id: 'u1', billing_month: '2026-04', used_usd: new Decimal('100.00') }),
    ];

    // Only the non-null daily record (100) is summed — matches the summary exactly.
    const result = reconcileDailyToMonthly(daily, summary);
    expect(result.discrepancies).toHaveLength(0);
  });
});

// --- detectUnmatchedReferences ---

describe('detectUnmatchedReferences', () => {
  it('returns no unmatched references when all api_key_ids have a matching Key_Usage_Record (Req 21.3)', () => {
    const details: RequestDetailRecord[] = [
      makeRequestDetail({ request_id: 'r1', api_key_id: 'k1', user_id: 'u1', billing_month: '2026-04' }),
      makeRequestDetail({ request_id: 'r2', api_key_id: 'k1', user_id: 'u1', billing_month: '2026-04' }),
    ];
    const keys: KeyUsageRecord[] = [
      makeKeyRecord({ api_key_id: 'k1', user_id: 'u1', billing_month: '2026-04' }),
    ];

    const result = detectUnmatchedReferences(details, keys);
    expect(result.unmatchedReferences).toHaveLength(0);
    expect(result.logEntries).toHaveLength(0);
  });

  it('detects an unmatched api_key_id (Req 21.3)', () => {
    const details: RequestDetailRecord[] = [
      makeRequestDetail({ request_id: 'r1', api_key_id: 'k-orphan', user_id: 'u1', billing_month: '2026-04' }),
    ];
    const keys: KeyUsageRecord[] = [
      makeKeyRecord({ api_key_id: 'k1', user_id: 'u1', billing_month: '2026-04' }),
    ];

    const result = detectUnmatchedReferences(details, keys);
    expect(result.unmatchedReferences).toHaveLength(1);
    expect(result.unmatchedReferences[0]).toEqual({
      requestId: 'r1',
      apiKeyId: 'k-orphan',
      month: '2026-04',
    });
  });

  it('retains unmatched records — function does not discard them (Req 21.3)', () => {
    const details: RequestDetailRecord[] = [
      makeRequestDetail({ request_id: 'r1', api_key_id: 'k-orphan', user_id: 'u1', billing_month: '2026-04' }),
    ];
    // No key records at all.
    const result = detectUnmatchedReferences(details, []);
    // The function should report the unmatched reference but the detail is still there.
    expect(result.unmatchedReferences).toHaveLength(1);
    expect(result.logEntries).toHaveLength(1);
    // The original details array is unchanged (records are retained).
    expect(details).toHaveLength(1);
  });

  it('deduplicates log entries for the same api_key_id + month', () => {
    const details: RequestDetailRecord[] = [
      makeRequestDetail({ request_id: 'r1', api_key_id: 'k-orphan', user_id: 'u1', billing_month: '2026-04' }),
      makeRequestDetail({ request_id: 'r2', api_key_id: 'k-orphan', user_id: 'u1', billing_month: '2026-04' }),
      makeRequestDetail({ request_id: 'r3', api_key_id: 'k-orphan', user_id: 'u1', billing_month: '2026-04' }),
    ];

    const result = detectUnmatchedReferences(details, []);
    // Only one entry per unique api_key_id + billing_month.
    expect(result.unmatchedReferences).toHaveLength(1);
    expect(result.logEntries).toHaveLength(1);
    // Uses the first request_id encountered.
    expect(result.unmatchedReferences[0].requestId).toBe('r1');
  });

  it('matches by billing_month — same key in different months is not a match', () => {
    const details: RequestDetailRecord[] = [
      makeRequestDetail({ request_id: 'r1', api_key_id: 'k1', user_id: 'u1', billing_month: '2026-05' }),
    ];
    const keys: KeyUsageRecord[] = [
      // Key record exists but for a different month.
      makeKeyRecord({ api_key_id: 'k1', user_id: 'u1', billing_month: '2026-04' }),
    ];

    const result = detectUnmatchedReferences(details, keys);
    expect(result.unmatchedReferences).toHaveLength(1);
    expect(result.unmatchedReferences[0].month).toBe('2026-05');
  });

  it('handles multiple unmatched keys across different months', () => {
    const details: RequestDetailRecord[] = [
      makeRequestDetail({ request_id: 'r1', api_key_id: 'k-a', user_id: 'u1', billing_month: '2026-04' }),
      makeRequestDetail({ request_id: 'r2', api_key_id: 'k-b', user_id: 'u1', billing_month: '2026-05' }),
    ];
    const keys: KeyUsageRecord[] = [];

    const result = detectUnmatchedReferences(details, keys);
    expect(result.unmatchedReferences).toHaveLength(2);
  });

  it('produces ingestion log entries of type unmatched_reference', () => {
    const details: RequestDetailRecord[] = [
      makeRequestDetail({ request_id: 'r1', api_key_id: 'k-orphan', user_id: 'u1', billing_month: '2026-04' }),
    ];

    const result = detectUnmatchedReferences(details, []);
    expect(result.logEntries[0]).toEqual({
      type: 'unmatched_reference',
      requestId: 'r1',
      apiKeyId: 'k-orphan',
      month: '2026-04',
    });
  });
});
