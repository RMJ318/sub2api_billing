/**
 * General numeric codec for `number`-typed fields that are not constrained to
 * the non-negative-integer rule of Requirement 2.4.
 *
 * The documented record schema contains numeric fields that the requirements
 * do not list among the token/count fields (Req 2.4) and that carry fractional
 * values in the real exports, e.g. `usage_percent` (`43.39`),
 * `avg_duration_ms` (`25290.74`), `avg_first_token_ms`, `duration_ms`,
 * `first_token_ms`, `active_days`, and `api_key_count`. Those fields are typed
 * `number | null` in the data models, so they need a converter that accepts a
 * finite decimal number while still rejecting non-numeric input.
 *
 * This codec accepts an optional sign followed by digits with at most one
 * decimal separator (mirroring the monetary grammar of Req 2.3) and converts
 * it to a JavaScript `number`. Exponential notation, multiple separators,
 * embedded whitespace, hex, and other non-numeric values are conversion
 * failures. It is pure and deterministic.
 *
 * It deliberately lives outside `field-codecs.ts`: those codecs implement the
 * specific Requirement 2.3-2.8 rules, while this is a general-purpose numeric
 * converter used by the row parser's per-record-type schemas (Task 3.7).
 */
import type { CodecResult, FieldCodec } from '../types/parsing.js';

/** Optional sign, digits, and at most one decimal separator (e.g. `43.39`, `-5`, `.5`, `5.`). */
const NUMERIC_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export const numeric: FieldCodec<number> = {
  parse(raw: string): CodecResult<number> {
    if (!NUMERIC_PATTERN.test(raw)) {
      return {
        ok: false,
        reason: `Expected a numeric value, got "${raw}"`,
      };
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      // Defensive: the pattern already excludes Infinity/NaN-producing inputs.
      return { ok: false, reason: `"${raw}" is not a finite number` };
    }
    return { ok: true, value };
  },
};
