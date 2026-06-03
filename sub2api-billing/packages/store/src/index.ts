/**
 * @core/store - data store adapters.
 *
 * Holds the in-memory record sets indexed by Billing_Month (summary/daily/
 * model/key) and the DuckDB-backed `request_detail` table with paginated,
 * filtered, sorted queries. Side-effecting; verified with example/integration
 * tests rather than property tests.
 *
 * Implemented incrementally by subsequent tasks.
 */
export const STORE_PACKAGE = '@core/store' as const;

// In-memory record sets indexed by Billing_Month (Requirement 1.8): the
// summary/daily/model/key record store with month-scoped accessors and
// ascending `availableMonths()`.
export { InMemoryRecordStore } from './record-store.js';
export type { RecordSets } from './record-store.js';

// DuckDB-backed `request_detail` store (Requirement 3.1): the documented table
// schema + indexes and the filter/sort/pagination query function the Query
// Service builds its guards on (Req 3.4, 3.5, 3.7, 3.8).
export {
  REQUEST_DETAIL_TABLE,
  DEFAULT_PAGE_SIZE,
  createRequestDetailSchema,
  openRequestDetailDb,
  insertRequestDetailRecords,
  queryRequestDetail,
} from './request-detail-store.js';

// Query Service request-detail path (Requirements 3.2, 3.3, 3.4, 3.5, 3.7, 3.8):
// the guard layer over the DuckDB query that enforces the required Billing_Month
// filter (rejecting with an error + no records before any DuckDB access) and
// clamps the page size to 1..1000 (default 100), delegating conjunctive
// filtering, default-sort, pagination, and totals to `queryRequestDetail`.
export {
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
  clampPageSize,
  queryRequestDetailService,
} from './query-service.js';
export type {
  RequestDetailQueryInput,
  RequestDetailQueryResult,
  RequestDetailQueryErrorCode,
} from './query-service.js';

// Aggregate query functions for all pages (Task 17.6, Requirements 3.6, 13.2,
// 13.3, 21.4): the query service layer between the in-memory record store and
// the API that wires the pure compute library to serve dashboard KPIs/charts,
// user/model/key/cost aggregates, insights, and signals from summary record sets
// and server-side aggregation (never a full client load of `request_detail`).
// All money is summed in USD with no currency conversion (Decimal as-is).
export {
  getDashboardAggregates,
  getUserAggregates,
  getUserTrend,
  getModelAggregates,
  getKeyAggregates,
  getCostAggregates,
  getInsightsAggregates,
  getSignalAggregates,
} from './aggregate-queries.js';
export type {
  TrendPointDto,
  DashboardAggregates,
  UserBudgetEntry,
  UserAggregates,
  UserTrendData,
  ModelAggregates,
  KeyAggregates,
  CostAggregates,
  InsightsAggregates,
  SignalAggregates,
} from './aggregate-queries.js';
