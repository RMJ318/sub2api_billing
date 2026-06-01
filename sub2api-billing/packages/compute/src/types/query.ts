/**
 * Query / page DTO types for the request-detail query path
 * (design "Query Service", Requirement 3).
 *
 * These describe the conjunctive filter + sort + pagination contract used by
 * the Query Service and exposed over the API.
 */
import type { RequestDetailRecord } from './records.js';

/** Inclusive date range filter (Req 3.4, 19.2). */
export interface DateRange {
  start: Date;
  end: Date;
}

/** Sortable columns for request-detail results (Req 3.5). */
export type RequestDetailSortBy = 'total_cost_usd' | 'duration_ms' | 'created_at';

/** Sort direction. */
export type SortDir = 'asc' | 'desc';

/**
 * A request-detail query. `billingMonth` is required (Req 3.3); all other
 * criteria combine conjunctively before pagination (Req 3.4).
 */
export interface RequestDetailQuery {
  billingMonth: string; // REQUIRED (Req 3.3)
  userId?: string;
  model?: string;
  apiKeyId?: string;
  dateRange?: DateRange; // inclusive (Req 3.4, 19.2)
  sortBy?: RequestDetailSortBy; // default created_at (Req 3.5)
  sortDir?: SortDir; // default desc
  page?: number; // 1-based
  pageSize?: number; // 1..1000, default 100 (Req 3.2)
}

/** A page of request-detail results with pagination metadata (Req 3.7). */
export interface RequestDetailPage {
  records: RequestDetailRecord[];
  totalCount: number; // matching records (Req 3.7)
  totalPages: number; // ceil(totalCount / pageSize) (Req 3.7)
  page: number;
  pageSize: number;
}
