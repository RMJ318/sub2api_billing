import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import {
  detectSignals,
  detectHighSpend,
  detectLowBalance,
  detectApiKeyAnomaly,
  detectResponseTimeAnomaly,
  detectRiskHint,
  unreadCount,
} from './signals.js';
import type { DailyUsageRecord, MonthlySummaryRecord, Signal } from './types/index.js';

/**
 * Unit tests for the Signal Engine detection rules
 * (Requirements 16.2, 17.1–17.6).
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<MonthlySummaryRecord> = {}): MonthlySummaryRecord {
  return {
    billing_month: '2026-05',
    user_id: 'user-1',
    email: null,
    username: null,
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: null,
    monthly_limit_usd: new Decimal('1000'),
    used_usd: new Decimal('500'),
    remaining_monthly_limit_usd: new Decimal('500'),
    usage_percent: 50,
    request_count: 100,
    api_key_count: 2,
    active_days: 10,
    input_tokens: 1000,
    output_tokens: 500,
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
    avg_duration_ms: 3000,
    avg_first_token_ms: null,
    first_request_at: null,
    last_request_at: null,
    ...overrides,
  };
}

function makeDaily(overrides: Partial<DailyUsageRecord> = {}): DailyUsageRecord {
  return {
    billing_month: '2026-05',
    usage_date: new Date('2026-05-10'),
    user_id: 'user-1',
    email: null,
    username: null,
    request_count: 10,
    used_usd: new Decimal('50'),
    input_tokens: 100,
    output_tokens: 50,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: 2000,
    ...overrides,
  };
}

// ─── High-Spend Detection (Req 17.1) ───────────────────────────────────────

describe('detectHighSpend', () => {
  it('triggers when day spend exceeds 20% of monthly limit', () => {
    const summaries = [makeSummary({ monthly_limit_usd: new Decimal('1000') })];
    // 20% of 1000 = 200; spend of 250 > 200 → signal
    const daily = [makeDaily({ used_usd: new Decimal('250') })];
    const signals = detectHighSpend(daily, summaries);
    expect(signals).toHaveLength(1);
    expect(signals[0].group).toBe('high_spend');
    expect(signals[0].severity).toBe('warning');
    expect(signals[0].target.page).toBe('user-analysis');
    expect(signals[0].target.entityId).toBe('user-1');
  });

  it('does not trigger when day spend is exactly 20% of limit', () => {
    const summaries = [makeSummary({ monthly_limit_usd: new Decimal('1000') })];
    // 20% of 1000 = 200; spend of exactly 200 is NOT > 200
    const daily = [makeDaily({ used_usd: new Decimal('200') })];
    const signals = detectHighSpend(daily, summaries);
    expect(signals).toHaveLength(0);
  });

  it('does not trigger when day spend is below 20% of limit', () => {
    const summaries = [makeSummary({ monthly_limit_usd: new Decimal('1000') })];
    const daily = [makeDaily({ used_usd: new Decimal('100') })];
    const signals = detectHighSpend(daily, summaries);
    expect(signals).toHaveLength(0);
  });

  it('skips users without a budget limit', () => {
    const summaries = [makeSummary({ monthly_limit_usd: null })];
    const daily = [makeDaily({ used_usd: new Decimal('9999') })];
    const signals = detectHighSpend(daily, summaries);
    expect(signals).toHaveLength(0);
  });
});

// ─── Low-Balance Detection (Req 17.2) ──────────────────────────────────────

describe('detectLowBalance', () => {
  it('triggers when remaining is exactly 10% of limit', () => {
    // 10% of 1000 = 100; remaining 100 <= 100 → signal
    const summaries = [
      makeSummary({
        monthly_limit_usd: new Decimal('1000'),
        remaining_monthly_limit_usd: new Decimal('100'),
      }),
    ];
    const signals = detectLowBalance(summaries);
    expect(signals).toHaveLength(1);
    expect(signals[0].group).toBe('low_balance');
    expect(signals[0].severity).toBe('critical');
  });

  it('triggers when remaining is below 10% of limit', () => {
    const summaries = [
      makeSummary({
        monthly_limit_usd: new Decimal('1000'),
        remaining_monthly_limit_usd: new Decimal('50'),
      }),
    ];
    const signals = detectLowBalance(summaries);
    expect(signals).toHaveLength(1);
  });

  it('does not trigger when remaining is above 10% of limit', () => {
    const summaries = [
      makeSummary({
        monthly_limit_usd: new Decimal('1000'),
        remaining_monthly_limit_usd: new Decimal('200'),
      }),
    ];
    const signals = detectLowBalance(summaries);
    expect(signals).toHaveLength(0);
  });

  it('skips users without a budget limit', () => {
    const summaries = [
      makeSummary({
        monthly_limit_usd: null,
        remaining_monthly_limit_usd: new Decimal('5'),
      }),
    ];
    const signals = detectLowBalance(summaries);
    expect(signals).toHaveLength(0);
  });
});

// ─── API Key Anomaly Detection (Req 17.3) ──────────────────────────────────

describe('detectApiKeyAnomaly', () => {
  it('triggers when a day exceeds 3x the daily average', () => {
    // average = (10 + 10 + 10 + 100) / 4 = 32.5; threshold = 97.5; day 4 (100) > 97.5
    const keyMap = new Map<string, number[]>([['key-1', [10, 10, 10, 100]]]);
    const signals = detectApiKeyAnomaly(keyMap);
    expect(signals).toHaveLength(1);
    expect(signals[0].group).toBe('api_key_anomaly');
    expect(signals[0].severity).toBe('warning');
    expect(signals[0].target.page).toBe('key-analysis');
    expect(signals[0].target.entityId).toBe('key-1');
  });

  it('does not trigger when no day exceeds 3x average', () => {
    // average = (10 + 10 + 10 + 10) / 4 = 10; threshold = 30; no day > 30
    const keyMap = new Map<string, number[]>([['key-1', [10, 10, 10, 10]]]);
    const signals = detectApiKeyAnomaly(keyMap);
    expect(signals).toHaveLength(0);
  });

  it('skips empty key records', () => {
    const keyMap = new Map<string, number[]>([['key-1', []]]);
    const signals = detectApiKeyAnomaly(keyMap);
    expect(signals).toHaveLength(0);
  });
});

// ─── Response-Time Anomaly Detection (Req 17.4) ────────────────────────────

describe('detectResponseTimeAnomaly', () => {
  it('triggers when avg_duration_ms exceeds 60000', () => {
    const summaries = [makeSummary({ avg_duration_ms: 65000 })];
    const signals = detectResponseTimeAnomaly(summaries);
    expect(signals).toHaveLength(1);
    expect(signals[0].group).toBe('response_time_anomaly');
    expect(signals[0].severity).toBe('informational');
    expect(signals[0].target.page).toBe('user-analysis');
  });

  it('does not trigger at exactly 60000ms', () => {
    const summaries = [makeSummary({ avg_duration_ms: 60000 })];
    const signals = detectResponseTimeAnomaly(summaries);
    expect(signals).toHaveLength(0);
  });

  it('does not trigger below 60000ms', () => {
    const summaries = [makeSummary({ avg_duration_ms: 30000 })];
    const signals = detectResponseTimeAnomaly(summaries);
    expect(signals).toHaveLength(0);
  });

  it('skips users with null avg_duration_ms', () => {
    const summaries = [makeSummary({ avg_duration_ms: null })];
    const signals = detectResponseTimeAnomaly(summaries);
    expect(signals).toHaveLength(0);
  });
});

// ─── Risk Hint Detection (Req 17.5) ────────────────────────────────────────

describe('detectRiskHint', () => {
  it('triggers on 2 consecutive high-spend days', () => {
    const summaries = [makeSummary({ monthly_limit_usd: new Decimal('1000') })];
    // 20% of 1000 = 200; both days > 200
    const daily = [
      makeDaily({ usage_date: new Date('2026-05-10'), used_usd: new Decimal('250') }),
      makeDaily({ usage_date: new Date('2026-05-11'), used_usd: new Decimal('300') }),
    ];
    const signals = detectRiskHint(daily, summaries);
    expect(signals).toHaveLength(1);
    expect(signals[0].group).toBe('risk_hint');
    expect(signals[0].severity).toBe('critical');
    expect(signals[0].message).toContain('2 consecutive days');
  });

  it('triggers on 3+ consecutive high-spend days', () => {
    const summaries = [makeSummary({ monthly_limit_usd: new Decimal('1000') })];
    const daily = [
      makeDaily({ usage_date: new Date('2026-05-10'), used_usd: new Decimal('250') }),
      makeDaily({ usage_date: new Date('2026-05-11'), used_usd: new Decimal('300') }),
      makeDaily({ usage_date: new Date('2026-05-12'), used_usd: new Decimal('280') }),
    ];
    const signals = detectRiskHint(daily, summaries);
    expect(signals).toHaveLength(1);
    expect(signals[0].message).toContain('3 consecutive days');
  });

  it('does not trigger on a single high-spend day', () => {
    const summaries = [makeSummary({ monthly_limit_usd: new Decimal('1000') })];
    const daily = [
      makeDaily({ usage_date: new Date('2026-05-10'), used_usd: new Decimal('250') }),
      makeDaily({ usage_date: new Date('2026-05-12'), used_usd: new Decimal('50') }),
    ];
    const signals = detectRiskHint(daily, summaries);
    expect(signals).toHaveLength(0);
  });

  it('does not trigger on non-consecutive high-spend days', () => {
    const summaries = [makeSummary({ monthly_limit_usd: new Decimal('1000') })];
    // Days are not consecutive (gap between 10 and 12)
    const daily = [
      makeDaily({ usage_date: new Date('2026-05-10'), used_usd: new Decimal('250') }),
      makeDaily({ usage_date: new Date('2026-05-12'), used_usd: new Decimal('300') }),
    ];
    const signals = detectRiskHint(daily, summaries);
    expect(signals).toHaveLength(0);
  });
});

// ─── Composite detectSignals (Requirements 16.2, 17.1–17.6) ────────────────

describe('detectSignals', () => {
  it('combines all rule outputs into a single list', () => {
    const summaries = [
      makeSummary({
        user_id: 'user-1',
        monthly_limit_usd: new Decimal('1000'),
        remaining_monthly_limit_usd: new Decimal('50'), // low-balance trigger
        avg_duration_ms: 70000, // response-time trigger
      }),
    ];
    const daily = [
      makeDaily({
        user_id: 'user-1',
        usage_date: new Date('2026-05-10'),
        used_usd: new Decimal('250'), // high-spend trigger
      }),
      makeDaily({
        user_id: 'user-1',
        usage_date: new Date('2026-05-11'),
        used_usd: new Decimal('300'), // high-spend trigger + risk hint
      }),
    ];
    const keyMap = new Map<string, number[]>([['key-1', [10, 10, 10, 100]]]); // anomaly trigger

    const signals = detectSignals({ summaries, daily, keyDailyRequestCounts: keyMap });

    // Should have: 2 high-spend + 1 low-balance + 1 key anomaly + 1 response-time + 1 risk hint = 6
    const groups = signals.map((s) => s.group);
    expect(groups.filter((g) => g === 'high_spend')).toHaveLength(2);
    expect(groups.filter((g) => g === 'low_balance')).toHaveLength(1);
    expect(groups.filter((g) => g === 'api_key_anomaly')).toHaveLength(1);
    expect(groups.filter((g) => g === 'response_time_anomaly')).toHaveLength(1);
    expect(groups.filter((g) => g === 'risk_hint')).toHaveLength(1);
  });

  it('returns empty array when no rules trigger', () => {
    const summaries = [makeSummary({ remaining_monthly_limit_usd: new Decimal('500') })];
    const daily = [makeDaily({ used_usd: new Decimal('50') })];
    const keyMap = new Map<string, number[]>();
    const signals = detectSignals({ summaries, daily, keyDailyRequestCounts: keyMap });
    expect(signals).toHaveLength(0);
  });

  it('every signal has required fields', () => {
    const summaries = [
      makeSummary({
        monthly_limit_usd: new Decimal('1000'),
        remaining_monthly_limit_usd: new Decimal('50'),
        avg_duration_ms: 70000,
      }),
    ];
    const daily = [makeDaily({ used_usd: new Decimal('250') })];
    const keyMap = new Map<string, number[]>([['key-1', [1, 1, 1, 100]]]);

    const signals = detectSignals({ summaries, daily, keyDailyRequestCounts: keyMap });

    for (const signal of signals) {
      expect(signal.id).toBeTruthy();
      expect(['high_spend', 'low_balance', 'api_key_anomaly', 'response_time_anomaly', 'risk_hint']).toContain(signal.group);
      expect(['informational', 'warning', 'critical']).toContain(signal.severity);
      expect(signal.message).toBeTruthy();
      expect(signal.target.page).toBeTruthy();
      expect(signal.target.entityId).toBeTruthy();
      expect(signal.read).toBe(false);
    }
  });
});


// ─── Unread Badge Count (Req 16.3) ─────────────────────────────────────────

describe('unreadCount', () => {
  function makeSignal(overrides: Partial<Signal> = {}): Signal {
    return {
      id: 'test-signal',
      group: 'high_spend',
      severity: 'warning',
      message: 'Test signal',
      target: { page: 'user-analysis', entityId: 'user-1' },
      read: false,
      ...overrides,
    };
  }

  it('returns 0 for an empty signal list', () => {
    expect(unreadCount([])).toBe(0);
  });

  it('counts all signals as unread when none are read', () => {
    const signals = [
      makeSignal({ id: 's1', read: false }),
      makeSignal({ id: 's2', read: false }),
      makeSignal({ id: 's3', read: false }),
    ];
    expect(unreadCount(signals)).toBe(3);
  });

  it('returns 0 when all signals are read', () => {
    const signals = [
      makeSignal({ id: 's1', read: true }),
      makeSignal({ id: 's2', read: true }),
    ];
    expect(unreadCount(signals)).toBe(0);
  });

  it('counts only unread signals in a mixed list', () => {
    const signals = [
      makeSignal({ id: 's1', read: false }),
      makeSignal({ id: 's2', read: true }),
      makeSignal({ id: 's3', read: false }),
      makeSignal({ id: 's4', read: true }),
      makeSignal({ id: 's5', read: false }),
    ];
    expect(unreadCount(signals)).toBe(3);
  });

  it('each signal exposes target with page and entityId for navigation', () => {
    const signals = [
      makeSignal({ target: { page: 'user-analysis', entityId: 'user-42' } }),
      makeSignal({ target: { page: 'key-analysis', entityId: 'key-7' } }),
    ];
    for (const signal of signals) {
      expect(signal.target.page).toBeTruthy();
      expect(signal.target.entityId).toBeTruthy();
    }
  });
});
