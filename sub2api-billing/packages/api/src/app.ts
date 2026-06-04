import Fastify, { type FastifyInstance } from 'fastify';
import type { DuckDBConnection } from '@duckdb/node-api';
import { Decimal } from 'decimal.js';
import type { InMemoryRecordStore } from '@core/store';
import {
  insertRequestDetailRecords,
  getDashboardAggregates,
  getUserAggregates,
  getUserTrend,
  getModelAggregates,
  getKeyAggregates,
  getCostAggregates,
  getInsightsAggregates,
  getSignalAggregates,
  queryRequestDetailService,
} from '@core/store';
import type {
  RequestDetailQueryInput,
} from '@core/store';
import {
  isValidDateRange,
  buildCsvExport,
  parseCsv,
  monthlySummarySchema,
  dailyUsageSchema,
  modelUsageSchema,
  keyUsageSchema,
  requestDetailSchema,
} from '@core/compute';
import type { RequestDetailSortBy, SortDir } from '@core/compute';
import { fillBillingMonthFromFolder } from '@core/ingest';

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Billing month regex: YYYY-MM where MM is 01–12. */
const BILLING_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Validate that a billing month query param is present and well-formed.
 * Returns `{ valid: true, value }` on success or `{ valid: false, error }` on
 * failure.
 */
function validateBillingMonth(raw: unknown): { valid: true; value: string } | { valid: false; error: string } {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { valid: false, error: 'billingMonth query parameter is required.' };
  }
  const value = String(raw).trim();
  if (!BILLING_MONTH_RE.test(value)) {
    return { valid: false, error: `billingMonth must be in YYYY-MM format, got "${value}".` };
  }
  return { valid: true, value };
}

/**
 * Parse and clamp page size to [1, 1000], defaulting to 100.
 */
function parsePageSize(raw: unknown): number {
  if (raw === undefined || raw === null) return 100;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 100;
  const floored = Math.floor(n);
  if (floored < 1) return 1;
  if (floored > 1000) return 1000;
  return floored;
}

/**
 * Parse page number (1-based), defaulting to 1.
 */
function parsePage(raw: unknown): number {
  if (raw === undefined || raw === null) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Parse an optional date range from start/end query params.
 * Returns undefined if neither is provided. Returns an error string if
 * start > end (Req 19.3).
 */
function parseDateRange(
  startRaw: unknown,
  endRaw: unknown,
): { valid: true; range?: { start: Date; end: Date } } | { valid: false; error: string } {
  if (
    (startRaw === undefined || startRaw === null || startRaw === '') &&
    (endRaw === undefined || endRaw === null || endRaw === '')
  ) {
    return { valid: true, range: undefined };
  }
  const startStr = String(startRaw ?? '').trim();
  const endStr = String(endRaw ?? '').trim();

  if (startStr && !endStr) {
    return { valid: false, error: 'dateEnd is required when dateStart is provided.' };
  }
  if (!startStr && endStr) {
    return { valid: false, error: 'dateStart is required when dateEnd is provided.' };
  }

  const start = new Date(startStr);
  const end = new Date(endStr);

  if (isNaN(start.getTime())) {
    return { valid: false, error: `dateStart is not a valid date: "${startStr}".` };
  }
  if (isNaN(end.getTime())) {
    return { valid: false, error: `dateEnd is not a valid date: "${endStr}".` };
  }

  if (!isValidDateRange(start, end)) {
    return { valid: false, error: 'dateStart must not be after dateEnd.' };
  }

  return { valid: true, range: { start, end } };
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO shaping: convert Decimal to string for JSON serialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively convert any Decimal instances in an object tree to strings.
 * This ensures the JSON response doesn't lose precision when serializing money.
 */
function shapeDtoDecimals(obj: unknown): unknown {
  if (obj instanceof Decimal) {
    return obj.toString();
  }
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(shapeDtoDecimals);
  }
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = shapeDtoDecimals(value);
    }
    return result;
  }
  return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
// App factory
// ─────────────────────────────────────────────────────────────────────────────

export interface AppDependencies {
  store: InMemoryRecordStore;
  duckDbConnection?: DuckDBConnection;
}

interface CostTreemapNode {
  name: string;
  value?: string;
  children?: CostTreemapNode[];
}

const IMPORTABLE_FILE_NAMES = new Set([
  'monthly_user_summary.csv',
  'daily_user_usage.csv',
  'model_user_usage.csv',
  'api_key_usage.csv',
  'request_detail.csv',
]);

/**
 * Builds the Fastify application instance with all analytics API routes.
 *
 * Routes:
 *  - GET /health
 *  - GET /api/dashboard?billingMonth=YYYY-MM
 *  - GET /api/users?billingMonth=YYYY-MM
 *  - GET /api/users/:userId/trend?billingMonth=YYYY-MM
 *  - GET /api/models?billingMonth=YYYY-MM
 *  - GET /api/keys?billingMonth=YYYY-MM
 *  - GET /api/cost?billingMonth=YYYY-MM
 *  - GET /api/insights?billingMonth=YYYY-MM
 *  - GET /api/signals?billingMonth=YYYY-MM
 *  - GET /api/request-detail?billingMonth=YYYY-MM&page=1&pageSize=100&...filters
 *  - GET /api/export?pageName=...&billingMonth=YYYY-MM
 */
export function buildApp(deps?: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  // ─── Health ────────────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/health', async () => ({ status: 'ok' }));

  // If no dependencies provided, return the bare app (for backward compat with
  // existing test that only checks /health).
  if (!deps) {
    return app;
  }

  const { store, duckDbConnection } = deps;

  app.get('/api/metadata/months', async () => ({
    months: store.availableMonths().slice().reverse(),
  }));

  app.post('/api/import-csv', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const monthResult = validateBillingMonth(body.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }

    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    if (!IMPORTABLE_FILE_NAMES.has(fileName)) {
      return reply.status(400).send({
        error:
          'fileName must be one of monthly_user_summary.csv, daily_user_usage.csv, model_user_usage.csv, api_key_usage.csv, request_detail.csv.',
      });
    }

    const csvText = typeof body.csvText === 'string' ? body.csvText : '';
    if (csvText.trim() === '') {
      return reply.status(400).send({ error: 'csvText is required.' });
    }

    const schema =
      fileName === 'monthly_user_summary.csv'
        ? monthlySummarySchema
        : fileName === 'daily_user_usage.csv'
          ? dailyUsageSchema
          : fileName === 'model_user_usage.csv'
            ? modelUsageSchema
            : fileName === 'api_key_usage.csv'
              ? keyUsageSchema
              : requestDetailSchema;

    const parseResult = parseCsv(csvText, schema);
    const normalizedRecords = parseResult.records.map((record) => {
      const candidate = record as { billing_month?: string | null };
      if (candidate.billing_month == null) {
        candidate.billing_month = '';
      }
      return fillBillingMonthFromFolder(
        candidate as { billing_month: string },
        monthResult.value,
      );
    });

    if (fileName === 'request_detail.csv') {
      if (!duckDbConnection) {
        return reply.status(503).send({ error: 'Request detail store is not available.' });
      }
      await insertRequestDetailRecords(duckDbConnection, normalizedRecords as never[]);
    } else {
      switch (fileName) {
        case 'monthly_user_summary.csv':
          store.load({ monthlySummaries: normalizedRecords as never[] });
          break;
        case 'daily_user_usage.csv':
          store.load({ dailyUsage: normalizedRecords as never[] });
          break;
        case 'model_user_usage.csv':
          store.load({ modelUsage: normalizedRecords as never[] });
          break;
        case 'api_key_usage.csv':
          store.load({ keyUsage: normalizedRecords as never[] });
          break;
      }
    }

    return {
      billingMonth: monthResult.value,
      fileName,
      recordsLoaded: normalizedRecords.length,
      rowsRejected: parseResult.rows.filter((row) => row.failures.length > 0).length,
    };
  });

  // ─── GET /api/dashboard ────────────────────────────────────────────────────
  app.get('/api/dashboard', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }
    const data = getDashboardAggregates(store, monthResult.value);
    return shapeDtoDecimals(data);
  });

  // ─── GET /api/users ────────────────────────────────────────────────────────
  app.get('/api/users', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }
    const data = getUserAggregates(store, monthResult.value);
    return shapeDtoDecimals(data);
  });

  // ─── GET /api/users/:userId/trend ──────────────────────────────────────────
  app.get('/api/users/:userId/trend', async (request, reply) => {
    const params = request.params as Record<string, string>;
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }
    const userId = params.userId;
    if (!userId || userId.trim() === '') {
      return reply.status(400).send({ error: 'userId path parameter is required.' });
    }
    const data = getUserTrend(store, monthResult.value, userId);
    return shapeDtoDecimals(data);
  });

  // ─── GET /api/models ───────────────────────────────────────────────────────
  app.get('/api/models', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }
    const data = getModelAggregates(store, monthResult.value);
    return shapeDtoDecimals(data);
  });

  // ─── GET /api/keys ─────────────────────────────────────────────────────────
  app.get('/api/keys', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }
    const data = getKeyAggregates(store, monthResult.value);
    return shapeDtoDecimals(data);
  });

  app.get('/api/keys/:apiKeyId/trend', async (request, reply) => {
    if (!duckDbConnection) {
      return reply.status(503).send({ error: 'Request detail store is not available.' });
    }

    const params = request.params as Record<string, string>;
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }

    const apiKeyId = params.apiKeyId;
    if (!apiKeyId || apiKeyId.trim() === '') {
      return reply.status(400).send({ error: 'apiKeyId path parameter is required.' });
    }

    const result = await queryRequestDetailService(duckDbConnection, {
      billingMonth: monthResult.value,
      apiKeyId,
      pageSize: 1000,
    });

    if (!result.ok) {
      return reply.status(400).send({ error: result.error, code: result.code });
    }

    const byDay = new Map<string, { spend: number; requests: number }>();
    for (const record of result.page.records) {
      if (!record.created_at) {
        continue;
      }
      const bucket = record.created_at.toISOString().slice(0, 10);
      const existing = byDay.get(bucket) ?? { spend: 0, requests: 0 };
      existing.spend += Number(record.total_cost_usd?.toString() ?? '0');
      existing.requests += 1;
      byDay.set(bucket, existing);
    }

    const points = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, values]) => ({
        bucket,
        spend: values.spend.toString(),
        requests: values.requests.toString(),
      }));

    return {
      spend: points.map((point) => ({ bucket: point.bucket, value: point.spend })),
      requests: points.map((point) => ({ bucket: point.bucket, value: point.requests })),
    };
  });

  // ─── GET /api/cost ─────────────────────────────────────────────────────────
  app.get('/api/cost', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }
    const data = getCostAggregates(store, monthResult.value);
    const treemap = duckDbConnection
      ? await buildCostTreemap(duckDbConnection, monthResult.value)
      : [];
    return shapeDtoDecimals({ ...data, treemap });
  });

  // ─── GET /api/insights ─────────────────────────────────────────────────────
  app.get('/api/insights', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }
    const data = getInsightsAggregates(store, monthResult.value);
    return shapeDtoDecimals(data);
  });

  // ─── GET /api/signals ──────────────────────────────────────────────────────
  app.get('/api/signals', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }
    const data = getSignalAggregates(store, monthResult.value);
    return shapeDtoDecimals(data);
  });

  // ─── GET /api/request-detail ───────────────────────────────────────────────
  app.get('/api/request-detail', async (request, reply) => {
    if (!duckDbConnection) {
      return reply.status(503).send({ error: 'Request detail store is not available.' });
    }

    const query = request.query as Record<string, unknown>;

    // billingMonth is validated at the service layer (queryRequestDetailService
    // rejects with a typed error when missing), but we also validate format here
    // for a friendlier 400 message on malformed months.
    const monthRaw = query.billingMonth;
    if (monthRaw !== undefined && monthRaw !== '') {
      const monthCheck = validateBillingMonth(monthRaw);
      if (!monthCheck.valid) {
        return reply.status(400).send({ error: monthCheck.error });
      }
    }

    // Date range validation (Req 19.2, 19.3)
    const dateRangeResult = parseDateRange(query.dateStart, query.dateEnd);
    if (!dateRangeResult.valid) {
      return reply.status(400).send({ error: dateRangeResult.error });
    }

    // Build the service-layer query input
    const input: RequestDetailQueryInput = {
      billingMonth: monthRaw !== undefined && monthRaw !== ''
        ? String(monthRaw).trim()
        : undefined,
      userId: query.userId ? String(query.userId) : undefined,
      model: query.model ? String(query.model) : undefined,
      apiKeyId: query.apiKeyId ? String(query.apiKeyId) : undefined,
      dateRange: dateRangeResult.range,
      sortBy: parseSortBy(query.sortBy),
      sortDir: parseSortDir(query.sortDir),
      page: parsePage(query.page),
      pageSize: parsePageSize(query.pageSize),
    };

    const result = await queryRequestDetailService(duckDbConnection, input);

    if (!result.ok) {
      return reply.status(400).send({ error: result.error, code: result.code });
    }

    return shapeDtoDecimals(result.page);
  });

  // ─── GET /api/export ───────────────────────────────────────────────────────
  app.get('/api/export', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const monthResult = validateBillingMonth(query.billingMonth);
    if (!monthResult.valid) {
      return reply.status(400).send({ error: monthResult.error });
    }
    const pageName = query.pageName ? String(query.pageName).trim() : '';
    if (!pageName) {
      return reply.status(400).send({ error: 'pageName query parameter is required.' });
    }

    // Build export data based on the page
    const { columns, rows } = getExportData(store, pageName, monthResult.value);

    const exportResult = buildCsvExport({
      pageName,
      billingMonth: monthResult.value,
      columns,
      rows,
    });

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    return reply.send(exportResult.content);
  });

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for request-detail query parsing
// ─────────────────────────────────────────────────────────────────────────────

const VALID_SORT_BY: Set<string> = new Set(['total_cost_usd', 'duration_ms', 'created_at']);

function parseSortBy(raw: unknown): RequestDetailSortBy | undefined {
  if (raw === undefined || raw === null) return undefined;
  const str = String(raw).trim();
  return VALID_SORT_BY.has(str) ? (str as RequestDetailSortBy) : undefined;
}

function parseSortDir(raw: unknown): SortDir | undefined {
  if (raw === undefined || raw === null) return undefined;
  const str = String(raw).trim().toLowerCase();
  if (str === 'asc') return 'asc';
  if (str === 'desc') return 'desc';
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export data builder per page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate export columns and rows for a given page.
 * Uses the aggregate query functions to gather the data that would be shown
 * on each page, then flattens it to a row-of-objects format suitable for CSV.
 */
function getExportData(
  store: InMemoryRecordStore,
  pageName: string,
  billingMonth: string,
): { columns: string[]; rows: Record<string, unknown>[] } {
  switch (pageName) {
    case 'dashboard': {
      const data = getDashboardAggregates(store, billingMonth);
      const columns = ['label', 'userId', 'spend'];
      const rows = data.topUserSpend.map((u) => ({
        label: u.label,
        userId: u.userId,
        spend: u.spend,
      }));
      return { columns, rows };
    }
    case 'users': {
      const data = getUserAggregates(store, billingMonth);
      const columns = ['userId', 'label', 'spend', 'requestCount', 'totalTokens', 'apiKeyCount'];
      const rows = data.rankings.map((r) => ({
        userId: r.userId,
        label: r.label,
        spend: r.spend,
        requestCount: r.requestCount,
        totalTokens: r.totalTokens,
        apiKeyCount: r.apiKeyCount,
      }));
      return { columns, rows };
    }
    case 'models': {
      const data = getModelAggregates(store, billingMonth);
      const columns = ['model', 'spend', 'requestCount'];
      const rows = data.spendRanking.map((r) => {
        const reqEntry = data.requestRanking.find((rr) => rr.model === r.model);
        return {
          model: r.model,
          spend: r.spend,
          requestCount: reqEntry?.requestCount ?? 0,
        };
      });
      return { columns, rows };
    }
    case 'keys': {
      const data = getKeyAggregates(store, billingMonth);
      const columns = ['apiKeyId', 'apiKeyName', 'spend', 'requestCount', 'ownerLabel', 'deleted'];
      const rows = data.rankings.map((r) => ({
        apiKeyId: r.apiKeyId,
        apiKeyName: r.apiKeyName ?? '',
        spend: r.spend,
        requestCount: r.requestCount,
        ownerLabel: r.ownerLabel,
        deleted: r.deleted,
      }));
      return { columns, rows };
    }
    case 'cost': {
      const data = getCostAggregates(store, billingMonth);
      const columns = ['bucket', 'value'];
      const rows = data.trend.daily.map((p) => ({
        bucket: p.bucket,
        value: p.value,
      }));
      return { columns, rows };
    }
    default: {
      // Unknown page: return empty export
      return { columns: [], rows: [] };
    }
  }
}

async function buildCostTreemap(
  connection: DuckDBConnection,
  billingMonth: string,
): Promise<CostTreemapNode[]> {
  const reader = await connection.runAndReadAll(
    `SELECT
       user_id,
       COALESCE(NULLIF(username, ''), NULLIF(email, ''), user_id) AS user_label,
       COALESCE(model, 'Unknown') AS model_label,
       api_key_id,
       COALESCE(NULLIF(api_key_name, ''), api_key_id) AS api_key_label,
       SUM(total_cost_usd) AS spend
     FROM request_detail
     WHERE billing_month = $billingMonth
     GROUP BY 1, 2, 3, 4, 5
     ORDER BY spend DESC`,
    { billingMonth },
  );

  const userMap = new Map<
    string,
    {
      name: string;
      total: number;
      models: Map<
        string,
        {
          name: string;
          total: number;
          keys: CostTreemapNode[];
        }
      >;
    }
  >();

  for (const row of reader.getRowObjects() as Array<Record<string, unknown>>) {
    const userId = String(row.user_id);
    const userLabel = String(row.user_label);
    const modelLabel = String(row.model_label);
    const apiKeyLabel = String(row.api_key_label);
    const spend = Number(String(row.spend ?? '0'));

    const userEntry =
      userMap.get(userId) ??
      {
        name: userLabel,
        total: 0,
        models: new Map(),
      };
    userEntry.total += spend;

    const modelEntry =
      userEntry.models.get(modelLabel) ??
      {
        name: modelLabel,
        total: 0,
        keys: [],
      };
    modelEntry.total += spend;
    modelEntry.keys.push({
      name: apiKeyLabel,
      value: spend.toString(),
    });

    userEntry.models.set(modelLabel, modelEntry);
    userMap.set(userId, userEntry);
  }

  return [...userMap.values()].map((userEntry) => ({
    name: userEntry.name,
    value: userEntry.total.toString(),
    children: [...userEntry.models.values()].map((modelEntry) => ({
      name: modelEntry.name,
      value: modelEntry.total.toString(),
      children: modelEntry.keys,
    })),
  }));
}
