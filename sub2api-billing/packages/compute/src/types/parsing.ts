/**
 * CSV parsing / normalization types (design "CSV Parser and Normalizer").
 *
 * These describe the pure parsing contract: each field is converted by a
 * `FieldCodec`, a row produces a `RowResult`, and any failures are captured
 * as `ParseFailure` entries (which also flow into the ingestion log).
 */

/** A single field that failed type conversion or required-field validation. */
export interface ParseFailure {
  field: string;
  rawValue: string;
  reason: string;
}

/**
 * Outcome of parsing one CSV row into a record of type `T`.
 * `record` is present when the row is accepted; `failures` is non-empty when
 * the row is rejected (Requirement 2.9).
 */
export interface RowResult<T> {
  record?: T;
  failures: ParseFailure[];
  rowNumber: number;
}

/** Result of a single codec conversion: success with a value, or a reason. */
export type CodecResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** A pure converter from a raw (already-trimmed) string to a typed value. */
export interface FieldCodec<T> {
  parse(raw: string): CodecResult<T>;
}
