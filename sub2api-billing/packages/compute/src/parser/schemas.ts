/**
 * Per-record-type column -> codec schemas (Requirements 2.10, 2.11).
 *
 * Each schema lists every documented column for a CSV source under its
 * documented header name (Req 2.1, 2.11), pairs it with the field codec that
 * converts its raw value (Req 2.3-2.8), and marks the columns that are required
 * for that record type (Req 2.10). The row parser (`row-parser.ts`) consumes
 * these schemas to map columns by header name, apply codecs, and enforce
 * required fields.
 *
 * Codec selection rules (faithful to Requirement 2):
 * - Monetary `*_usd` fields use {@link moneyUsd} (Decimal, Req 2.3).
 * - The token/count fields enumerated in Req 2.4 (`input_tokens`,
 *   `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`,
 *   `image_output_tokens`, `image_count`, `request_count`) use
 *   {@link tokenCount} (non-negative integer, Req 2.4).
 * - Timestamp fields (`usage_date`, `created_at`, `first_request_at`,
 *   `last_request_at`) use {@link timestampTz} (Req 2.5).
 * - `stream` and `api_key_deleted` booleans use {@link streamBool} (Req 2.6).
 * - Free-text / id fields use {@link text} (trim; empty -> null, Req 2.7/2.8).
 * - Remaining `number` fields that Req 2.4 does NOT enumerate and that carry
 *   fractional values in the data (`usage_percent`, `api_key_count`,
 *   `active_days`, `avg_duration_ms`, `avg_first_token_ms`, `duration_ms`,
 *   `first_token_ms`) use {@link numeric} (general finite number).
 *
 * `billing_month` is intentionally NOT marked required here: Requirement 2.10
 * does not list it, and Requirement 1.3 lets the Ingestion Service fill an
 * empty `billing_month` from the folder name after parsing.
 */
import type { FieldCodec } from '../types/parsing.js';
import type {
  MonthlySummaryRecord,
  DailyUsageRecord,
  ModelUsageRecord,
  KeyUsageRecord,
  RequestDetailRecord,
} from '../types/records.js';
import { moneyUsd, tokenCount, timestampTz, streamBool, text } from '../codecs/field-codecs.js';
import { numeric } from './numeric-codec.js';

/** One column of a record schema: its documented header name, codec, and whether it is required. */
export interface ColumnSchema {
  /** Documented header name the column is mapped by (Req 2.1). */
  field: string;
  /** Codec converting the (trimmed) raw value to its typed value (Req 2.3-2.8). */
  codec: FieldCodec<unknown>;
  /** Whether an empty value rejects the row for this record type (Req 2.10). */
  required: boolean;
}

/** A record type's full ordered column set. The phantom `T` ties it to the produced record type. */
export interface RecordSchema<T> {
  /** Stable name of the record type, used as a registry key and in logs. */
  recordType: string;
  /** Documented columns in source order (Req 2.11). */
  columns: ColumnSchema[];
  /** Phantom marker so `RecordSchema<MonthlySummaryRecord>` is distinct at the type level. */
  readonly __recordBrand?: T;
}

const req = (field: string, codec: FieldCodec<unknown>): ColumnSchema => ({
  field,
  codec,
  required: true,
});
const opt = (field: string, codec: FieldCodec<unknown>): ColumnSchema => ({
  field,
  codec,
  required: false,
});

/** `monthly_user_summary.csv` -> {@link MonthlySummaryRecord}. Required: `user_id`. */
export const monthlySummarySchema: RecordSchema<MonthlySummaryRecord> = {
  recordType: 'monthly_summary',
  columns: [
    opt('billing_month', text),
    req('user_id', text),
    opt('email', text),
    opt('username', text),
    opt('wechat', text),
    opt('notes', text),
    opt('role', text),
    opt('status', text),
    opt('current_balance_usd', moneyUsd),
    opt('monthly_limit_usd', moneyUsd),
    opt('used_usd', moneyUsd),
    opt('remaining_monthly_limit_usd', moneyUsd),
    opt('usage_percent', numeric),
    opt('request_count', tokenCount),
    opt('api_key_count', numeric),
    opt('active_days', numeric),
    opt('input_tokens', tokenCount),
    opt('output_tokens', tokenCount),
    opt('cache_creation_tokens', tokenCount),
    opt('cache_read_tokens', tokenCount),
    opt('image_output_tokens', tokenCount),
    opt('image_count', tokenCount),
    opt('input_cost_usd', moneyUsd),
    opt('output_cost_usd', moneyUsd),
    opt('cache_creation_cost_usd', moneyUsd),
    opt('cache_read_cost_usd', moneyUsd),
    opt('image_output_cost_usd', moneyUsd),
    opt('actual_cost_usd', moneyUsd),
    opt('avg_duration_ms', numeric),
    opt('avg_first_token_ms', numeric),
    opt('first_request_at', timestampTz),
    opt('last_request_at', timestampTz),
  ],
};

/** `daily_user_usage.csv` -> {@link DailyUsageRecord}. Required: `user_id`, `usage_date`. */
export const dailyUsageSchema: RecordSchema<DailyUsageRecord> = {
  recordType: 'daily_usage',
  columns: [
    opt('billing_month', text),
    req('usage_date', timestampTz),
    req('user_id', text),
    opt('email', text),
    opt('username', text),
    opt('request_count', tokenCount),
    opt('used_usd', moneyUsd),
    opt('input_tokens', tokenCount),
    opt('output_tokens', tokenCount),
    opt('cache_read_tokens', tokenCount),
    opt('image_output_tokens', tokenCount),
    opt('avg_duration_ms', numeric),
  ],
};

/** `model_user_usage.csv` -> {@link ModelUsageRecord}. Required: `user_id`, `model`. */
export const modelUsageSchema: RecordSchema<ModelUsageRecord> = {
  recordType: 'model_usage',
  columns: [
    opt('billing_month', text),
    req('user_id', text),
    opt('email', text),
    opt('username', text),
    req('model', text),
    opt('request_count', tokenCount),
    opt('used_usd', moneyUsd),
    opt('input_tokens', tokenCount),
    opt('output_tokens', tokenCount),
    opt('cache_creation_tokens', tokenCount),
    opt('cache_read_tokens', tokenCount),
    opt('image_output_tokens', tokenCount),
    opt('avg_duration_ms', numeric),
  ],
};

/** `api_key_usage.csv` -> {@link KeyUsageRecord}. Required: `user_id`, `api_key_id`. */
export const keyUsageSchema: RecordSchema<KeyUsageRecord> = {
  recordType: 'key_usage',
  columns: [
    opt('billing_month', text),
    req('user_id', text),
    opt('email', text),
    opt('username', text),
    req('api_key_id', text),
    opt('api_key_name', text),
    opt('api_key_status', text),
    opt('api_key_deleted', streamBool),
    opt('request_count', tokenCount),
    opt('used_usd', moneyUsd),
    opt('input_tokens', tokenCount),
    opt('output_tokens', tokenCount),
    opt('first_request_at', timestampTz),
    opt('last_request_at', timestampTz),
  ],
};

/**
 * `request_detail.csv` -> {@link RequestDetailRecord}.
 * Required: `user_id`, `api_key_id`, `request_id` (Req 2.10). `created_at` is
 * nullable/optional per the data model.
 */
export const requestDetailSchema: RecordSchema<RequestDetailRecord> = {
  recordType: 'request_detail',
  columns: [
    opt('billing_month', text),
    opt('created_at', timestampTz),
    req('user_id', text),
    opt('email', text),
    opt('username', text),
    req('api_key_id', text),
    opt('api_key_name', text),
    req('request_id', text),
    opt('model', text),
    opt('inbound_endpoint', text),
    opt('upstream_endpoint', text),
    opt('input_tokens', tokenCount),
    opt('output_tokens', tokenCount),
    opt('cache_creation_tokens', tokenCount),
    opt('cache_read_tokens', tokenCount),
    opt('image_output_tokens', tokenCount),
    opt('image_count', tokenCount),
    opt('total_cost_usd', moneyUsd),
    opt('actual_cost_usd', moneyUsd),
    opt('duration_ms', numeric),
    opt('first_token_ms', numeric),
    opt('stream', streamBool),
    opt('ip_address', text),
    opt('user_agent', text),
  ],
};

/** Registry of all five record schemas keyed by their stable `recordType` name. */
export const RECORD_SCHEMAS = {
  monthly_summary: monthlySummarySchema,
  daily_usage: dailyUsageSchema,
  model_usage: modelUsageSchema,
  key_usage: keyUsageSchema,
  request_detail: requestDetailSchema,
} as const;

/** Union of the stable record-type names accepted by {@link RECORD_SCHEMAS}. */
export type RecordType = keyof typeof RECORD_SCHEMAS;
