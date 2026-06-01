/**
 * Query Service — request-detail query path (design "Query Service",
 * Requirements 3.2, 3.3, 3.4, 3.5, 3.7, 3.8).
 *
 * This is the guard layer that sits on top of the DuckDB-level
 * {@link queryRequestDetail} in `request-detail-store.ts`. The DuckDB function
 * already knows how to filter conjunctively, sort, and paginate; this layer
 * enforces the *service contract* the UI/API depend on:
 *
 *  - `billingMonth` is REQUIRED: a missing or blank month is rejected with an
 *    error response and **no records**, *before* any DuckDB access (Req 3.3).
 *  - `pageSize` is clamped to the inclusive range 1..1000, defaulting to 100
 *    (Req 3.2). Values below 1, above 1000, or non-finite are normalized rather
 *    than passed through to the store.
 *  - The default sort is `created_at` descending and the conjunctive
 *    user/model/key/date-range filters are applied before pagination — both
 *    delegated to the DuckDB layer (Req 3.4, 3.5).
 *  - `totalCount`/`totalPages` are always returned, and a page beyond the last
 *    yields an empty record set with the correct totals (Req 3.7, 3.8) — also
 *    delegated to the DuckDB layer.
 *
 * The result is a discriminated union so the API layer can map a rejected
 * request to an error HTTP response while a successful request carries a
 * {@link RequestDetailPage}.
 */
import type { DuckDBConnection } from '@duckdb/node-api';
import type { RequestDetailQuery, RequestDetailPage } from '@core/compute';
import { DEFAULT_PAGE_SIZE, queryRequestDetail } from './request-detail-store.js';

/** Smallest accepted page size (Req 3.2). */
export const MIN_PAGE_SIZE = 1;

/** Largest accepted page size (Req 3.2). */
export const MAX_PAGE_SIZE = 1000;

/**
 * Service-layer input for a request-detail query. It mirrors
 * {@link RequestDetailQuery} but makes `billingMonth` optional, because this is
 * the trust boundary (e.g. an HTTP handler) where the month may be absent or
 * blank and must be guarded against (Req 3.3).
 */
export interface RequestDetailQueryInput extends Omit<RequestDetailQuery, 'billingMonth'> {
  /** REQUIRED at runtime; optional in the type so the guard can reject it (Req 3.3). */
  billingMonth?: string;
}

/** Machine-readable reason a request-detail query was rejected. */
export type RequestDetailQueryErrorCode = 'billing_month_required';

/**
 * The outcome of a request-detail query through the Query Service: either a
 * successful page or a rejection carrying an error message and code. The `ok`
 * discriminant lets callers branch without inspecting the payload shape.
 */
export type RequestDetailQueryResult =
  | { ok: true; page: RequestDetailPage }
  | { ok: false; error: string; code: RequestDetailQueryErrorCode };

/** Human-readable message for a missing Billing_Month filter (Req 3.3). */
const BILLING_MONTH_REQUIRED_MESSAGE =
  'A Billing_Month filter is required for request-detail queries.';

/**
 * Clamp a requested page size into the inclusive 1..1000 range, defaulting to
 * 100 (Req 3.2).
 *
 * A missing, non-finite, or sub-1 value becomes the default of 100; a value
 * below {@link MIN_PAGE_SIZE} is raised to 1; a value above {@link MAX_PAGE_SIZE}
 * is lowered to 1000; fractional values are floored. The result is always an
 * integer in 1..1000.
 *
 * @param pageSize - The requested page size, if any.
 * @returns A page size clamped to 1..1000.
 */
export function clampPageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || !Number.isFinite(pageSize)) {
    return DEFAULT_PAGE_SIZE;
  }
  const floored = Math.floor(pageSize);
  if (floored < MIN_PAGE_SIZE) {
    return MIN_PAGE_SIZE;
  }
  if (floored > MAX_PAGE_SIZE) {
    return MAX_PAGE_SIZE;
  }
  return floored;
}

/**
 * Decide whether a Billing_Month value satisfies the required-filter guard.
 * A value that is `undefined`, empty, or whitespace-only fails (Req 3.3).
 */
function hasBillingMonth(billingMonth: string | undefined): billingMonth is string {
  return billingMonth !== undefined && billingMonth.trim() !== '';
}

/**
 * Serve a page of Request_Detail_Records through the Query Service guards
 * (Requirements 3.2, 3.3, 3.4, 3.5, 3.7, 3.8).
 *
 * Order of operations matters for Req 3.3: the Billing_Month guard runs first,
 * so a rejected request never touches DuckDB and never returns records. When
 * the month is present, the page size is clamped to 1..1000 (Req 3.2) and the
 * normalized query is delegated to {@link queryRequestDetail}, which applies the
 * conjunctive filters before pagination (Req 3.4), the default `created_at`
 * descending sort (Req 3.5), and returns `totalCount`/`totalPages` with an empty
 * page when the requested page is beyond the last (Req 3.7, 3.8).
 *
 * @param connection - An open DuckDB connection whose schema has been created.
 * @param input - The request-detail query input from the API/UI boundary.
 * @returns A discriminated result: `{ ok: true, page }` or `{ ok: false, error, code }`.
 */
export async function queryRequestDetailService(
  connection: DuckDBConnection,
  input: RequestDetailQueryInput,
): Promise<RequestDetailQueryResult> {
  // Req 3.3: enforce the required Billing_Month filter BEFORE any DuckDB access.
  if (!hasBillingMonth(input.billingMonth)) {
    return {
      ok: false,
      error: BILLING_MONTH_REQUIRED_MESSAGE,
      code: 'billing_month_required',
    };
  }

  // Req 3.2: clamp the page size to 1..1000 (default 100). The conjunctive
  // filters (Req 3.4), default sort (Req 3.5), and totals/empty-page behavior
  // (Req 3.7, 3.8) are handled by the delegated DuckDB query.
  const normalized: RequestDetailQuery = {
    ...input,
    billingMonth: input.billingMonth,
    pageSize: clampPageSize(input.pageSize),
  };

  const page = await queryRequestDetail(connection, normalized);
  return { ok: true, page };
}
