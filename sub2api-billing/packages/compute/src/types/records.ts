/**
 * Normalized record types for the five sub2api billing CSV sources.
 *
 * These mirror the design's Data Models section exactly:
 * - Money fields use `Decimal` (decimal.js) to preserve the up-to-6-digit
 *   fractional precision seen in the data (e.g. `433.930721`).
 * - Token / count fields are integers (`number`).
 * - Timestamp fields are timezone-aware `Date`s.
 * - `null` denotes an empty, non-required field.
 *
 * Required fields per record type (never null) follow Requirement 2.10:
 * `user_id` always; `usage_date` for daily; `model` for model usage;
 * `api_key_id` for key usage; `request_id` for request detail.
 */
import type { Decimal } from 'decimal.js';

/** One row of `monthly_user_summary.csv`: a user's whole-month usage. */
export interface MonthlySummaryRecord {
  billing_month: string; // YYYY-MM (required)
  user_id: string; // required
  email: string | null;
  username: string | null;
  wechat: string | null;
  notes: string | null;
  role: string | null;
  status: string | null;
  current_balance_usd: Decimal | null;
  monthly_limit_usd: Decimal | null;
  used_usd: Decimal | null;
  remaining_monthly_limit_usd: Decimal | null;
  usage_percent: number | null;
  request_count: number | null;
  api_key_count: number | null;
  active_days: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  image_output_tokens: number | null;
  image_count: number | null;
  input_cost_usd: Decimal | null;
  output_cost_usd: Decimal | null;
  cache_creation_cost_usd: Decimal | null;
  cache_read_cost_usd: Decimal | null;
  image_output_cost_usd: Decimal | null;
  actual_cost_usd: Decimal | null;
  avg_duration_ms: number | null;
  avg_first_token_ms: number | null;
  first_request_at: Date | null;
  last_request_at: Date | null;
}

/** One row of `daily_user_usage.csv`: a user's usage on a single day. */
export interface DailyUsageRecord {
  billing_month: string; // required
  usage_date: Date; // required
  user_id: string; // required
  email: string | null;
  username: string | null;
  request_count: number | null;
  used_usd: Decimal | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  image_output_tokens: number | null;
  avg_duration_ms: number | null;
}

/** One row of `model_user_usage.csv`: a user's monthly usage of one model. */
export interface ModelUsageRecord {
  billing_month: string; // required
  user_id: string; // required
  email: string | null;
  username: string | null;
  model: string; // required
  request_count: number | null;
  used_usd: Decimal | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  image_output_tokens: number | null;
  avg_duration_ms: number | null;
}

/** One row of `api_key_usage.csv`: a user's monthly usage of one API key. */
export interface KeyUsageRecord {
  billing_month: string; // required
  user_id: string; // required
  email: string | null;
  username: string | null;
  api_key_id: string; // required
  api_key_name: string | null;
  api_key_status: string | null;
  api_key_deleted: boolean | null;
  request_count: number | null;
  used_usd: Decimal | null;
  input_tokens: number | null;
  output_tokens: number | null;
  first_request_at: Date | null;
  last_request_at: Date | null;
}

/** One row of `request_detail.csv`: a single request (largest source). */
export interface RequestDetailRecord {
  billing_month: string; // required
  created_at: Date | null;
  user_id: string; // required
  email: string | null;
  username: string | null;
  api_key_id: string; // required
  api_key_name: string | null;
  request_id: string; // required
  model: string | null;
  inbound_endpoint: string | null;
  upstream_endpoint: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  image_output_tokens: number | null;
  image_count: number | null;
  total_cost_usd: Decimal | null;
  actual_cost_usd: Decimal | null;
  duration_ms: number | null;
  first_token_ms: number | null;
  stream: boolean | null;
  ip_address: string | null;
  user_agent: string | null;
}
