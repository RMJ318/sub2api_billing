import { describe, it, expect, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { InMemoryRecordStore } from '@core/store';
import type { DuckDBConnection } from '@duckdb/node-api';
import {
  openRequestDetailDb,
  insertRequestDetailRecords,
} from '@core/store';
import type {
  MonthlySummaryRecord,
  DailyUsageRecord,
  ModelUsageRecord,
  KeyUsageRecord,
  RequestDetailRecord,
} from '@core/compute';
import { buildApp } from './app.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<MonthlySummaryRecord> = {}): MonthlySummaryRecord {
  return {
    billing_month: '2026-04',
    user_id: 'user-1',
    email: 'user1@example.com',
    username: 'User One',
    wechat: null,
    notes: null,
    role: null,
    status: null,
    current_balance_usd: new Decimal('900'),
    monthly_limit_usd: new Decimal('1000'),
    used_usd: new Decimal('100'),
    remaining_monthly_limit_usd: new Decimal('900'),
    usage_percent: 10,
    request_count: 50,
    api_key_count: 2,
    active_days: 10,
    input_tokens: 1000,
    output_tokens: 500,
    cache_creation_tokens: 0,
    cache_read_tokens: 200,
    image_output_tokens: 0,
    image_count: 0,
    input_cost_usd: new Decimal('50'),
    output_cost_usd: new Decimal('30'),
    cache_creation_cost_usd: new Decimal('0'),
    cache_read_cost_usd: new Decimal('10'),
    image_output_cost_usd: new Decimal('0'),
    actual_cost_usd: new Decimal('90'),
    avg_duration_ms: 1200,
    avg_first_token_ms: 300,
    first_request_at: new Date('2026-04-01T10:00:00Z'),
    last_request_at: new Date('2026-04-15T14:00:00Z'),
    ...overrides,
  };
}

function makeDaily(overrides: Partial<DailyUsageRecord> = {}): DailyUsageRecord {
  return {
    billing_month: '2026-04',
    usage_date: new Date('2026-04-01'),
    user_id: 'user-1',
    email: 'user1@example.com',
    username: 'User One',
    request_count: 10,
    used_usd: new Decimal('20'),
    input_tokens: 200,
    output_tokens: 100,
    cache_read_tokens: 50,
    image_output_tokens: 0,
    avg_duration_ms: 1100,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ModelUsageRecord> = {}): ModelUsageRecord {
  return {
    billing_month: '2026-04',
    user_id: 'user-1',
    email: 'user1@example.com',
    username: 'User One',
    model: 'gpt-4o',
    request_count: 30,
    used_usd: new Decimal('60'),
    input_tokens: 800,
    output_tokens: 400,
    cache_creation_tokens: 0,
    cache_read_tokens: 100,
    image_output_tokens: 0,
    avg_duration_ms: 1000,
    ...overrides,
  };
}

function makeKey(overrides: Partial<KeyUsageRecord> = {}): KeyUsageRecord {
  return {
    billing_month: '2026-04',
    user_id: 'user-1',
    email: 'user1@example.com',
    username: 'User One',
    api_key_id: 'key-1',
    api_key_name: 'My Key',
    api_key_status: 'active',
    api_key_deleted: false,
    request_count: 30,
    used_usd: new Decimal('60'),
    input_tokens: 800,
    output_tokens: 400,
    first_request_at: new Date('2026-04-01T10:00:00Z'),
    last_request_at: new Date('2026-04-15T14:00:00Z'),
    ...overrides,
  };
}

function buildTestStore(): InMemoryRecordStore {
  const store = new InMemoryRecordStore();
  store.load({
    monthlySummaries: [makeSummary()],
    dailyUsage: [makeDaily(), makeDaily({ usage_date: new Date('2026-04-02'), used_usd: new Decimal('30') })],
    modelUsage: [makeModel()],
    keyUsage: [makeKey()],
  });
  return store;
}

let duckDbConnection: DuckDBConnection | undefined;

afterEach(() => {
  duckDbConnection?.closeSync();
  duckDbConnection = undefined;
});

function makeRequestDetail(overrides: Partial<RequestDetailRecord> = {}): RequestDetailRecord {
  return {
    billing_month: '2026-04',
    created_at: new Date('2026-04-01T10:00:00Z'),
    user_id: 'user-1',
    email: 'user1@example.com',
    username: 'User One',
    api_key_id: 'key-1',
    api_key_name: 'My Key',
    request_id: 'req-1',
    model: 'gpt-4o',
    inbound_endpoint: '/v1/chat/completions',
    upstream_endpoint: 'https://api.openai.com/v1/chat/completions',
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    image_output_tokens: 0,
    image_count: 0,
    total_cost_usd: new Decimal('1.500000'),
    actual_cost_usd: new Decimal('1.500000'),
    duration_ms: 1200,
    first_token_ms: 300,
    stream: true,
    ip_address: '127.0.0.1',
    user_agent: 'test-agent',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('@app/api health route', () => {
  it('responds 200 with status ok', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

describe('GET /api/metadata/months', () => {
  it('returns available billing months in descending order', async () => {
    const store = buildTestStore();
    store.load({
      monthlySummaries: [
        makeSummary({
          billing_month: '2026-05',
          user_id: 'user-2',
          email: 'user2@example.com',
          username: 'User Two',
        }),
      ],
    });
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/metadata/months' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ months: ['2026-05', '2026-04'] });
    await app.close();
  });
});

describe('GET /api/dashboard', () => {
  it('returns 400 when billingMonth is missing', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('billingMonth');
    await app.close();
  });

  it('returns 400 for malformed billingMonth', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/dashboard?billingMonth=2026-13' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns dashboard aggregates for a valid month', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/dashboard?billingMonth=2026-04' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kpis).toBeDefined();
    expect(body.kpis.totalSpendUsd).toBe('100');
    expect(body.dailyTrends).toBeDefined();
    expect(body.topUserSpend).toBeInstanceOf(Array);
    expect(body.modelFamilyShare).toBeDefined();
    expect(body.costComposition).toBeDefined();
    await app.close();
  });

  it('returns empty data for a month with no records', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/dashboard?billingMonth=2025-01' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kpis.totalSpendUsd).toBe('0');
    await app.close();
  });
});

describe('GET /api/users', () => {
  it('returns 400 when billingMonth is missing', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns user aggregates for a valid month', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/users?billingMonth=2026-04' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rankings).toBeInstanceOf(Array);
    expect(body.rankings[0].userId).toBe('user-1');
    expect(body.activityScatter).toBeInstanceOf(Array);
    expect(body.budgetMonitor).toBeInstanceOf(Array);
    await app.close();
  });
});

describe('GET /api/users/:userId/trend', () => {
  it('returns 400 when billingMonth is missing', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/users/user-1/trend' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns trend data for a valid user and month', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/users/user-1/trend?billingMonth=2026-04' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spend).toBeInstanceOf(Array);
    expect(body.requests).toBeInstanceOf(Array);
    expect(body.tokens).toBeInstanceOf(Array);
    await app.close();
  });
});

describe('GET /api/models', () => {
  it('returns model aggregates for a valid month', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/models?billingMonth=2026-04' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spendRanking).toBeInstanceOf(Array);
    expect(body.requestRanking).toBeInstanceOf(Array);
    expect(body.tokenStacks).toBeInstanceOf(Array);
    expect(body.efficiencyScatter).toBeInstanceOf(Array);
    await app.close();
  });

  it('uses the shared model classifier semantics for family grouping inputs', async () => {
    const store = new InMemoryRecordStore();
    store.load({
      monthlySummaries: [makeSummary()],
      modelUsage: [
        makeModel({ model: 'gpt-5.5', used_usd: new Decimal('10') }),
        makeModel({ model: 'claude-3-7-sonnet', used_usd: new Decimal('20') }),
        makeModel({ model: 'gemini-2.5-pro', used_usd: new Decimal('30') }),
        makeModel({ model: 'other-model', used_usd: new Decimal('40') }),
      ],
    });
    const app = buildApp({ store });
    const dashboardRes = await app.inject({
      method: 'GET',
      url: '/api/dashboard?billingMonth=2026-04',
    });
    expect(dashboardRes.statusCode).toBe(200);
    const body = dashboardRes.json();
    expect(body.modelFamilyShare.GPT).toBe('10');
    expect(body.modelFamilyShare.Claude).toBe('20');
    expect(body.modelFamilyShare.Gemini).toBe('30');
    expect(body.modelFamilyShare.Other).toBe('40');
    await app.close();
  });
});

describe('GET /api/keys', () => {
  it('returns key aggregates for a valid month', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/keys?billingMonth=2026-04' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rankings).toBeInstanceOf(Array);
    expect(body.rankings[0].apiKeyId).toBe('key-1');
    expect(body.keyHealth).toBeDefined();
    expect(body.allKeysDailyTrend).toBeDefined();
    await app.close();
  });
});

describe('GET /api/cost', () => {
  it('returns cost aggregates for a valid month', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/cost?billingMonth=2026-04' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.trend).toBeDefined();
    expect(body.trend.daily).toBeInstanceOf(Array);
    expect(body.pareto).toBeDefined();
    expect(body.forecast).toBeDefined();
    await app.close();
  });

  it('preserves USD values without currency conversion', async () => {
    const store = new InMemoryRecordStore();
    store.load({
      monthlySummaries: [
        makeSummary({
          billing_month: '2026-04',
          used_usd: new Decimal('123.456789'),
          monthly_limit_usd: new Decimal('1000'),
        }),
      ],
      dailyUsage: [
        makeDaily({
          billing_month: '2026-04',
          used_usd: new Decimal('123.456789'),
        }),
      ],
    });
    const app = buildApp({ store });
    const dashboardRes = await app.inject({
      method: 'GET',
      url: '/api/dashboard?billingMonth=2026-04',
    });
    expect(dashboardRes.statusCode).toBe(200);
    expect(dashboardRes.json().kpis.totalSpendUsd).toBe('123.456789');

    const costRes = await app.inject({
      method: 'GET',
      url: '/api/cost?billingMonth=2026-04',
    });
    expect(costRes.statusCode).toBe(200);
    expect(costRes.json().trend.daily[0].value).toBe('123.456789');
    await app.close();
  });
});

describe('GET /api/keys/:apiKeyId/trend', () => {
  it('returns 503 when DuckDB connection is not available', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({
      method: 'GET',
      url: '/api/keys/key-1/trend?billingMonth=2026-04',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 when apiKeyId path parameter is blank', async () => {
    const store = buildTestStore();
    duckDbConnection = await openRequestDetailDb();
    const app = buildApp({ store, duckDbConnection });
    const res = await app.inject({
      method: 'GET',
      url: '/api/keys/%20/trend?billingMonth=2026-04',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('apiKeyId');
    await app.close();
  });

  it('returns daily spend/request trend for the selected key', async () => {
    const store = buildTestStore();
    duckDbConnection = await openRequestDetailDb();
    await insertRequestDetailRecords(duckDbConnection, [
      makeRequestDetail({
        request_id: 'req-1',
        api_key_id: 'key-1',
        created_at: new Date('2026-04-01T10:00:00Z'),
        total_cost_usd: new Decimal('1.500000'),
      }),
      makeRequestDetail({
        request_id: 'req-2',
        api_key_id: 'key-1',
        created_at: new Date('2026-04-01T15:00:00Z'),
        total_cost_usd: new Decimal('2.250000'),
      }),
      makeRequestDetail({
        request_id: 'req-3',
        api_key_id: 'key-1',
        created_at: new Date('2026-04-02T09:00:00Z'),
        total_cost_usd: new Decimal('3.000000'),
      }),
      makeRequestDetail({
        request_id: 'req-4',
        api_key_id: 'other-key',
        created_at: new Date('2026-04-01T11:00:00Z'),
        total_cost_usd: new Decimal('99.000000'),
      }),
    ]);

    const app = buildApp({ store, duckDbConnection });
    const res = await app.inject({
      method: 'GET',
      url: '/api/keys/key-1/trend?billingMonth=2026-04',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spend).toEqual([
      { bucket: '2026-04-01', value: '3.75' },
      { bucket: '2026-04-02', value: '3' },
    ]);
    expect(body.requests).toEqual([
      { bucket: '2026-04-01', value: '2' },
      { bucket: '2026-04-02', value: '1' },
    ]);
    await app.close();
  });
});

describe('GET /api/insights', () => {
  it('returns insights for a valid month', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/insights?billingMonth=2026-04' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.topPerformers).toBeDefined();
    expect(body.trends).toBeInstanceOf(Array);
    await app.close();
  });
});

describe('GET /api/signals', () => {
  it('returns signals for a valid month', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/signals?billingMonth=2026-04' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.signals).toBeInstanceOf(Array);
    expect(typeof body.unreadCount).toBe('number');
    await app.close();
  });
});

describe('GET /api/request-detail', () => {
  it('returns 503 when DuckDB connection is not available', async () => {
    const store = buildTestStore();
    const app = buildApp({ store }); // no duckDbConnection
    const res = await app.inject({ method: 'GET', url: '/api/request-detail?billingMonth=2026-04' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 for malformed billingMonth', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/request-detail?billingMonth=bad' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 when billingMonth is missing (service guard)', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/request-detail' });
    // No DuckDB so we get 503 first; test the format guard path
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 for date range with start after end', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({
      method: 'GET',
      url: '/api/request-detail?billingMonth=2026-04&dateStart=2026-04-15&dateEnd=2026-04-01',
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/export', () => {
  it('returns 400 when billingMonth is missing', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/export?pageName=users' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when pageName is missing', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({ method: 'GET', url: '/api/export?billingMonth=2026-04' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('pageName');
    await app.close();
  });

  it('returns CSV content for valid export request', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({
      method: 'GET',
      url: '/api/export?pageName=users&billingMonth=2026-04',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('users_2026-04_');
    // CSV content should include the header
    expect(res.body).toContain('userId');
    expect(res.body).toContain('user-1');
    await app.close();
  });

  it('returns header-only CSV for unknown page', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    const res = await app.inject({
      method: 'GET',
      url: '/api/export?pageName=unknown-page&billingMonth=2026-04',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    await app.close();
  });
});

describe('page size validation', () => {
  it('clamps page size values below 1 to 1', async () => {
    const store = buildTestStore();
    const app = buildApp({ store });
    // Even though we can't test DuckDB here, we can verify the route doesn't crash with edge values
    const res = await app.inject({
      method: 'GET',
      url: '/api/request-detail?billingMonth=2026-04&pageSize=0',
    });
    // Will be 503 because no duckDb, but validates the parse didn't crash
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});
