import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { userActivityScatter, modelEfficiencyScatter } from './scatter.js';
import type { MonthlySummaryRecord, ModelUsageRecord } from './types/records.js';

function summary(overrides: Partial<MonthlySummaryRecord>): MonthlySummaryRecord {
  return {
    billing_month: '2026-04',
    user_id: 'u1',
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

function modelRow(overrides: Partial<ModelUsageRecord>): ModelUsageRecord {
  return {
    billing_month: '2026-04',
    user_id: 'u1',
    email: null,
    username: null,
    model: 'gpt-4o',
    request_count: null,
    used_usd: null,
    input_tokens: null,
    output_tokens: null,
    cache_creation_tokens: null,
    cache_read_tokens: null,
    image_output_tokens: null,
    avg_duration_ms: null,
    ...overrides,
  };
}

describe('userActivityScatter', () => {
  it('maps one point per user with X=requests, Y=spend, size=total tokens (Req 8.1, 8.2)', () => {
    const points = userActivityScatter([
      summary({
        user_id: 'u1',
        username: 'alice',
        request_count: 42,
        used_usd: new Decimal('123.45'),
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 10,
      }),
      summary({ user_id: 'u2', email: 'bob@example.com', request_count: 7, used_usd: new Decimal('1.5') }),
    ]);

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ id: 'u1', label: 'alice', x: 42, totalTokens: 160, size: 160 });
    expect(points[0].y.toString()).toBe('123.45');
    // username falls back to email (Req 7.5).
    expect(points[1]).toMatchObject({ id: 'u2', label: 'bob@example.com', x: 7, totalTokens: 0, size: 0 });
    expect(points[1].y.toString()).toBe('1.5');
  });

  it('treats missing numeric/money fields as zero', () => {
    const [p] = userActivityScatter([summary({ user_id: 'u9' })]);
    expect(p.x).toBe(0);
    expect(p.totalTokens).toBe(0);
    expect(p.size).toBe(0);
    expect(p.y.toString()).toBe('0');
  });

  it('size is monotonic non-decreasing in total token count', () => {
    const points = userActivityScatter([
      summary({ user_id: 'low', input_tokens: 5 }),
      summary({ user_id: 'high', input_tokens: 50 }),
    ]);
    const low = points.find((p) => p.id === 'low')!;
    const high = points.find((p) => p.id === 'high')!;
    expect(high.totalTokens).toBeGreaterThanOrEqual(low.totalTokens);
    expect(high.size).toBeGreaterThanOrEqual(low.size);
  });
});

describe('modelEfficiencyScatter', () => {
  it('emits one point per distinct model with weighted avg duration X and total spend Y (Req 11.4, 11.5)', () => {
    const points = modelEfficiencyScatter([
      modelRow({ model: 'gpt-4o', request_count: 1, avg_duration_ms: 100, used_usd: new Decimal('2'), input_tokens: 10 }),
      modelRow({ model: 'gpt-4o', request_count: 3, avg_duration_ms: 300, used_usd: new Decimal('3'), output_tokens: 20 }),
      modelRow({ model: 'claude-3', request_count: 2, avg_duration_ms: 50, used_usd: new Decimal('5') }),
    ]);

    expect(points).toHaveLength(2);
    const gpt = points.find((p) => p.id === 'gpt-4o')!;
    // request-weighted avg: (100*1 + 300*3) / (1+3) = 1000/4 = 250
    expect(gpt.x).toBe(250);
    expect(gpt.y.toString()).toBe('5');
    expect(gpt.totalTokens).toBe(30);
    expect(gpt.size).toBe(30);

    const claude = points.find((p) => p.id === 'claude-3')!;
    expect(claude.x).toBe(50);
    expect(claude.y.toString()).toBe('5');
  });

  it('weighted average is 0 when total request weight is 0', () => {
    const [p] = modelEfficiencyScatter([
      modelRow({ model: 'm', request_count: 0, avg_duration_ms: 999, used_usd: new Decimal('1') }),
    ]);
    expect(p.x).toBe(0);
    expect(p.y.toString()).toBe('1');
  });

  it('preserves first-seen model order', () => {
    const points = modelEfficiencyScatter([
      modelRow({ model: 'b' }),
      modelRow({ model: 'a' }),
      modelRow({ model: 'b' }),
    ]);
    expect(points.map((p) => p.id)).toEqual(['b', 'a']);
  });
});
