/**
 * DuckDB-backed `request_detail` store (design "Data Store" / "DuckDB Schema",
 * Requirement 3.1).
 *
 * `request_detail.csv` is the one large, unbounded source file, so it lives only
 * in DuckDB and is always queried server-side with pagination, conjunctive
 * filtering, and sorting (Requirement 3). This module owns:
 *
 *  - the documented table schema + indexes (`createRequestDetailSchema`),
 *  - a bulk insert path used by the streaming loader / tests
 *    (`insertRequestDetailRecords`), and
 *  - `queryRequestDetail`, the filter/sort/pagination query function.
 *
 * The higher-level Query Service guards (required `billingMonth`, page-size
 * clamp to 1..1000, default-sort policy) are layered on top of this in a later
 * task; this module implements the DuckDB-level capability those guards build
 * on. It is side-effecting and is verified with example/integration tests
 * rather than property tests.
 */
import {
  DuckDBInstance,
  DuckDBDecimalValue,
  DuckDBTimestampTZValue,
  decimalValue,
  timestampTZValue,
} from '@duckdb/node-api';
import type { DuckDBConnection, DuckDBAppender, DuckDBValue } from '@duckdb/node-api';
import { Decimal } from 'decimal.js';
import type {
  RequestDetailRecord,
  RequestDetailQuery,
  RequestDetailPage,
  RequestDetailSortBy,
  SortDir,
} from '@core/compute';

/** The DuckDB table name holding request-detail rows. */
export const REQUEST_DETAIL_TABLE = 'request_detail' as const;

/**
 * Money columns are stored as `DECIMAL(18,6)` to preserve the up-to-6-digit
 * fractional precision seen in the data (e.g. `433.930721`); these constants
 * keep the schema and the JS<->DuckDB decimal conversions in sync.
 */
const MONEY_WIDTH = 18;
const MONEY_SCALE = 6;

/**
 * Default page size when a query omits `pageSize` (Requirement 3.2). The strict
 * 1..1000 clamp is applied by the Query Service layer.
 */
export const DEFAULT_PAGE_SIZE = 100;

/**
 * The ordered column list for the `request_detail` table. This is the single
 * source of truth for both the `CREATE TABLE` statement and the appender row
 * order, so the two can never drift apart.
 */
const COLUMNS = [
  { name: 'billing_month', type: 'VARCHAR NOT NULL' },
  { name: 'created_at', type: 'TIMESTAMPTZ' },
  { name: 'user_id', type: 'VARCHAR NOT NULL' },
  { name: 'email', type: 'VARCHAR' },
  { name: 'username', type: 'VARCHAR' },
  { name: 'api_key_id', type: 'VARCHAR NOT NULL' },
  { name: 'api_key_name', type: 'VARCHAR' },
  { name: 'request_id', type: 'VARCHAR NOT NULL' },
  { name: 'model', type: 'VARCHAR' },
  { name: 'inbound_endpoint', type: 'VARCHAR' },
  { name: 'upstream_endpoint', type: 'VARCHAR' },
  { name: 'input_tokens', type: 'BIGINT' },
  { name: 'output_tokens', type: 'BIGINT' },
  { name: 'cache_creation_tokens', type: 'BIGINT' },
  { name: 'cache_read_tokens', type: 'BIGINT' },
  { name: 'image_output_tokens', type: 'BIGINT' },
  { name: 'image_count', type: 'BIGINT' },
  { name: 'total_cost_usd', type: `DECIMAL(${MONEY_WIDTH},${MONEY_SCALE})` },
  { name: 'actual_cost_usd', type: `DECIMAL(${MONEY_WIDTH},${MONEY_SCALE})` },
  { name: 'duration_ms', type: 'BIGINT' },
  { name: 'first_token_ms', type: 'BIGINT' },
  { name: 'stream', type: 'BOOLEAN' },
  { name: 'ip_address', type: 'VARCHAR' },
  { name: 'user_agent', type: 'VARCHAR' },
] as const;

/**
 * Whitelist mapping each accepted sort field (Requirement 3.5) to its physical
 * column. Sorting is never built from raw request strings, so there is no SQL
 * injection surface for the sort clause.
 */
const SORT_COLUMNS: Record<RequestDetailSortBy, string> = {
  total_cost_usd: 'total_cost_usd',
  duration_ms: 'duration_ms',
  created_at: 'created_at',
};

/**
 * Create the `request_detail` table and its indexes (Requirement 3.1). Idempotent:
 * safe to call on an already-initialized database.
 *
 * @param connection - An open DuckDB connection.
 */
export async function createRequestDetailSchema(connection: DuckDBConnection): Promise<void> {
  const columnDefs = COLUMNS.map((c) => `  ${c.name} ${c.type}`).join(',\n');
  await connection.run(
    `CREATE TABLE IF NOT EXISTS ${REQUEST_DETAIL_TABLE} (\n${columnDefs}\n);`,
  );
  // Index the month (every query is month-scoped, Req 3.3) and the conjunctive
  // filter columns (Req 3.4).
  await connection.run(
    `CREATE INDEX IF NOT EXISTS idx_rd_month ON ${REQUEST_DETAIL_TABLE}(billing_month);`,
  );
  await connection.run(
    `CREATE INDEX IF NOT EXISTS idx_rd_filter ON ${REQUEST_DETAIL_TABLE}(billing_month, user_id, api_key_id, model);`,
  );
}

/**
 * Open an in-memory DuckDB connection with the `request_detail` schema created.
 * Convenience entry point for tests and for callers that do not manage their own
 * DuckDB instance.
 *
 * @returns The open connection (caller is responsible for `closeSync`).
 */
export async function openRequestDetailDb(path = ':memory:'): Promise<DuckDBConnection> {
  const instance = await DuckDBInstance.create(path);
  const connection = await instance.connect();
  await createRequestDetailSchema(connection);
  return connection;
}

/**
 * Bulk-insert normalized request-detail records into the DuckDB table using the
 * appender (the bounded-memory streaming loader inserts in batches via this same
 * path). Columns are appended in the exact schema order defined by {@link COLUMNS}.
 *
 * @param connection - An open DuckDB connection whose schema has been created.
 * @param records - The records to insert.
 */
export async function insertRequestDetailRecords(
  connection: DuckDBConnection,
  records: readonly RequestDetailRecord[],
): Promise<void> {
  if (records.length === 0) {
    return;
  }
  const appender = await connection.createAppender(REQUEST_DETAIL_TABLE);
  try {
    for (const record of records) {
      appendRequestDetailRow(appender, record);
    }
    appender.flushSync();
  } finally {
    appender.closeSync();
  }
}

/**
 * Query request-detail rows with conjunctive filtering, sorting, and pagination
 * (Requirements 3.4, 3.5, 3.7, 3.8).
 *
 * Behavior:
 *  - Filters (`billingMonth`, `userId`, `model`, `apiKeyId`, `dateRange`) combine
 *    with AND and are applied before pagination (Req 3.4). The date range is
 *    inclusive on both ends (Req 3.4, 19.2).
 *  - Results are ordered by the selected sort field and direction, defaulting to
 *    `created_at` descending (Req 3.5), with `request_id` as a stable tiebreaker
 *    so pagination partitions the result deterministically.
 *  - `totalCount` and `totalPages` reflect all matching rows for the page size
 *    (Req 3.7); requesting a page beyond the last returns an empty `records`
 *    array with the correct totals (Req 3.8).
 *
 * @param connection - An open DuckDB connection whose schema has been created.
 * @param query - The request-detail query.
 * @returns A page of records plus pagination metadata.
 */
export async function queryRequestDetail(
  connection: DuckDBConnection,
  query: RequestDetailQuery,
): Promise<RequestDetailPage> {
  const page = query.page && query.page > 0 ? Math.floor(query.page) : 1;
  const pageSize =
    query.pageSize && query.pageSize > 0 ? Math.floor(query.pageSize) : DEFAULT_PAGE_SIZE;
  const sortBy: RequestDetailSortBy = query.sortBy ?? 'created_at';
  const sortDir: SortDir = query.sortDir ?? 'desc';

  const { whereClause, filterParams } = buildFilter(query);

  // Total matching rows (Req 3.7): counted independently of pagination.
  const countReader = await connection.runAndReadAll(
    `SELECT count(*) AS cnt FROM ${REQUEST_DETAIL_TABLE} ${whereClause};`,
    { ...filterParams },
  );
  const countRow = countReader.getRows()[0];
  const totalCount = countRow && countRow[0] != null ? Number(countRow[0] as bigint) : 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const orderColumn = SORT_COLUMNS[sortBy];
  const orderDir = sortDir === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * pageSize;

  const reader = await connection.runAndReadAll(
    `SELECT * FROM ${REQUEST_DETAIL_TABLE} ${whereClause} ` +
      `ORDER BY ${orderColumn} ${orderDir} NULLS LAST, request_id ASC ` +
      `LIMIT $limit OFFSET $offset;`,
    { ...filterParams, limit: pageSize, offset },
  );

  const records = reader.getRowObjects().map(rowToRequestDetailRecord);

  return { records, totalCount, totalPages, page, pageSize };
}

/**
 * Build the parameterized `WHERE` clause for a query. All filter values are
 * bound as prepared-statement parameters (never interpolated), and absent
 * criteria simply contribute no condition.
 */
function buildFilter(query: RequestDetailQuery): {
  whereClause: string;
  filterParams: Record<string, DuckDBValue>;
} {
  const conditions: string[] = ['billing_month = $billingMonth'];
  const filterParams: Record<string, DuckDBValue> = { billingMonth: query.billingMonth };

  if (query.userId !== undefined) {
    conditions.push('user_id = $userId');
    filterParams.userId = query.userId;
  }
  if (query.model !== undefined) {
    conditions.push('model = $model');
    filterParams.model = query.model;
  }
  if (query.apiKeyId !== undefined) {
    conditions.push('api_key_id = $apiKeyId');
    filterParams.apiKeyId = query.apiKeyId;
  }
  if (query.dateRange !== undefined) {
    conditions.push('created_at >= $dateStart AND created_at <= $dateEnd');
    filterParams.dateStart = dateToTimestampTZ(query.dateRange.start);
    filterParams.dateEnd = dateToTimestampTZ(query.dateRange.end);
  }

  return { whereClause: `WHERE ${conditions.join(' AND ')}`, filterParams };
}

// --- Row appending (JS record -> DuckDB row) ---------------------------------

function appendRequestDetailRow(appender: DuckDBAppender, r: RequestDetailRecord): void {
  appender.appendVarchar(r.billing_month);
  appendTimestampTZOrNull(appender, r.created_at);
  appender.appendVarchar(r.user_id);
  appendVarcharOrNull(appender, r.email);
  appendVarcharOrNull(appender, r.username);
  appender.appendVarchar(r.api_key_id);
  appendVarcharOrNull(appender, r.api_key_name);
  appender.appendVarchar(r.request_id);
  appendVarcharOrNull(appender, r.model);
  appendVarcharOrNull(appender, r.inbound_endpoint);
  appendVarcharOrNull(appender, r.upstream_endpoint);
  appendBigIntOrNull(appender, r.input_tokens);
  appendBigIntOrNull(appender, r.output_tokens);
  appendBigIntOrNull(appender, r.cache_creation_tokens);
  appendBigIntOrNull(appender, r.cache_read_tokens);
  appendBigIntOrNull(appender, r.image_output_tokens);
  appendBigIntOrNull(appender, r.image_count);
  appendDecimalOrNull(appender, r.total_cost_usd);
  appendDecimalOrNull(appender, r.actual_cost_usd);
  appendBigIntOrNull(appender, r.duration_ms);
  appendBigIntOrNull(appender, r.first_token_ms);
  appendBooleanOrNull(appender, r.stream);
  appendVarcharOrNull(appender, r.ip_address);
  appendVarcharOrNull(appender, r.user_agent);
  appender.endRow();
}

function appendVarcharOrNull(appender: DuckDBAppender, value: string | null): void {
  if (value == null) {
    appender.appendNull();
  } else {
    appender.appendVarchar(value);
  }
}

function appendBigIntOrNull(appender: DuckDBAppender, value: number | null): void {
  if (value == null) {
    appender.appendNull();
  } else {
    appender.appendBigInt(BigInt(value));
  }
}

function appendBooleanOrNull(appender: DuckDBAppender, value: boolean | null): void {
  if (value == null) {
    appender.appendNull();
  } else {
    appender.appendBoolean(value);
  }
}

function appendDecimalOrNull(appender: DuckDBAppender, value: Decimal | null): void {
  if (value == null) {
    appender.appendNull();
  } else {
    appender.appendDecimal(decimalToDuckDB(value));
  }
}

function appendTimestampTZOrNull(appender: DuckDBAppender, value: Date | null): void {
  if (value == null) {
    appender.appendNull();
  } else {
    appender.appendTimestampTZ(dateToTimestampTZ(value));
  }
}

// --- Value conversions (DuckDB row -> JS record) -----------------------------

function rowToRequestDetailRecord(row: Record<string, DuckDBValue>): RequestDetailRecord {
  return {
    billing_month: toStringValue(row.billing_month) ?? '',
    created_at: toDateValue(row.created_at),
    user_id: toStringValue(row.user_id) ?? '',
    email: toStringValue(row.email),
    username: toStringValue(row.username),
    api_key_id: toStringValue(row.api_key_id) ?? '',
    api_key_name: toStringValue(row.api_key_name),
    request_id: toStringValue(row.request_id) ?? '',
    model: toStringValue(row.model),
    inbound_endpoint: toStringValue(row.inbound_endpoint),
    upstream_endpoint: toStringValue(row.upstream_endpoint),
    input_tokens: toNumberValue(row.input_tokens),
    output_tokens: toNumberValue(row.output_tokens),
    cache_creation_tokens: toNumberValue(row.cache_creation_tokens),
    cache_read_tokens: toNumberValue(row.cache_read_tokens),
    image_output_tokens: toNumberValue(row.image_output_tokens),
    image_count: toNumberValue(row.image_count),
    total_cost_usd: toDecimalValue(row.total_cost_usd),
    actual_cost_usd: toDecimalValue(row.actual_cost_usd),
    duration_ms: toNumberValue(row.duration_ms),
    first_token_ms: toNumberValue(row.first_token_ms),
    stream: toBooleanValue(row.stream),
    ip_address: toStringValue(row.ip_address),
    user_agent: toStringValue(row.user_agent),
  };
}

function toStringValue(value: DuckDBValue | undefined): string | null {
  return value == null ? null : String(value);
}

function toNumberValue(value: DuckDBValue | undefined): number | null {
  if (value == null) {
    return null;
  }
  return typeof value === 'bigint' ? Number(value) : Number(value as number);
}

function toBooleanValue(value: DuckDBValue | undefined): boolean | null {
  return value == null ? null : Boolean(value);
}

function toDecimalValue(value: DuckDBValue | undefined): Decimal | null {
  if (value == null) {
    return null;
  }
  // `DuckDBDecimalValue.toString()` yields the exact decimal representation,
  // so the up-to-6-digit fractional precision survives the round-trip.
  if (value instanceof DuckDBDecimalValue) {
    return new Decimal(value.toString());
  }
  return new Decimal(String(value));
}

function toDateValue(value: DuckDBValue | undefined): Date | null {
  if (value == null) {
    return null;
  }
  if (value instanceof DuckDBTimestampTZValue) {
    // micros since epoch -> JS Date (millisecond precision).
    return new Date(Number(value.micros / 1000n));
  }
  if (value instanceof Date) {
    return value;
  }
  return null;
}

/** Convert a JS `Decimal` to a DuckDB `DECIMAL(18,6)` value (scaled bigint). */
function decimalToDuckDB(value: Decimal): DuckDBDecimalValue {
  const scaled = value.times('1000000').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return decimalValue(BigInt(scaled.toFixed(0)), MONEY_WIDTH, MONEY_SCALE);
}

/** Convert a JS `Date` to a DuckDB `TIMESTAMPTZ` value (micros since epoch). */
function dateToTimestampTZ(date: Date): DuckDBTimestampTZValue {
  return timestampTZValue(BigInt(date.getTime()) * 1000n);
}
