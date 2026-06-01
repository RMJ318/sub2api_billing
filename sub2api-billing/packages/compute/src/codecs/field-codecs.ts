/**
 * Pure CSV field codecs (design "CSV Parser and Normalizer", Requirement 2).
 *
 * Each codec converts a single raw cell value into a typed value or reports a
 * conversion failure. They are side-effect free and deterministic, and are the
 * primary target of property-based tests (design Properties 2-6).
 *
 * Trimming responsibility follows the documented parsing pipeline: the row
 * parser trims every value before applying a codec, so `moneyUsd`,
 * `tokenCount`, and `timestampTz` assume pre-trimmed input. `streamBool` and
 * `text` trim internally because their contracts (Req 2.6, 2.7/2.8) state so.
 */
import { Decimal } from 'decimal.js';
import type { CodecResult, FieldCodec } from '../types/parsing.js';

/**
 * Monetary USD codec (Requirement 2.3, Property 2).
 *
 * Accepts an optional sign followed by digits with at most one decimal
 * separator (e.g. `5`, `-0.5`, `+1000.00000000`, `.5`, `5.`) and converts it to
 * a `Decimal`, preserving fractional precision via decimal arithmetic. Any
 * other non-empty value (exponential notation, hex, `NaN`, embedded
 * whitespace, multiple separators, etc.) is a conversion failure.
 */
const MONEY_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export const moneyUsd: FieldCodec<Decimal> = {
  parse(raw: string): CodecResult<Decimal> {
    if (!MONEY_PATTERN.test(raw)) {
      return {
        ok: false,
        reason: `Expected an optional sign, digits, and at most one decimal separator, got "${raw}"`,
      };
    }
    try {
      return { ok: true, value: new Decimal(raw) };
    } catch {
      // Defensive: the regex should already exclude anything decimal.js rejects.
      return { ok: false, reason: `Could not parse "${raw}" as a USD decimal` };
    }
  },
};

/**
 * Token / count codec (Requirement 2.4, Property 3).
 *
 * Accepts a non-negative integer (one or more digits, no sign, no separator)
 * and converts it to a `number`. Negative, fractional, or non-numeric values
 * are conversion failures.
 */
const TOKEN_PATTERN = /^\d+$/;

export const tokenCount: FieldCodec<number> = {
  parse(raw: string): CodecResult<number> {
    if (!TOKEN_PATTERN.test(raw)) {
      return {
        ok: false,
        reason: `Expected a non-negative integer, got "${raw}"`,
      };
    }
    return { ok: true, value: Number(raw) };
  },
};

/**
 * Timestamp components matched against the documented data formats, e.g.
 * `2026-05-22`, `2026-05-22 15:53:45+08`, `2026-05-22T15:53:45.925156+08:00`.
 * The offset group is optional; when absent the value is interpreted as UTC.
 */
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** Parse a UTC offset token (`Z`, `+08`, `-0530`, `+08:00`) to signed minutes. */
function offsetToMinutes(token: string): number | null {
  if (token === 'Z') {
    return 0;
  }
  const sign = token[0] === '-' ? -1 : 1;
  const digits = token.slice(1).replace(':', '');
  const hours = Number(digits.slice(0, 2));
  const minutes = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  if (hours > 14 || minutes > 59) {
    return null;
  }
  return sign * (hours * 60 + minutes);
}

/**
 * Timestamp codec (Requirement 2.5, Property 4).
 *
 * Produces a timezone-aware instant (`Date`). When the value carries a UTC
 * offset, the instant reflects that offset; when it carries no offset, the
 * value is interpreted as UTC. Fractional seconds finer than milliseconds are
 * truncated to millisecond precision (the resolution `Date` can represent).
 */
export const timestampTz: FieldCodec<Date> = {
  parse(raw: string): CodecResult<Date> {
    const match = TIMESTAMP_PATTERN.exec(raw);
    if (!match) {
      return { ok: false, reason: `Could not parse "${raw}" as a timestamp` };
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = match[4] === undefined ? 0 : Number(match[4]);
    const minute = match[5] === undefined ? 0 : Number(match[5]);
    const second = match[6] === undefined ? 0 : Number(match[6]);
    const fraction = match[7];
    const offsetToken = match[8];

    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour > 23 ||
      minute > 59 ||
      second > 59
    ) {
      return { ok: false, reason: `Timestamp "${raw}" has an out-of-range component` };
    }

    const millis = fraction === undefined ? 0 : Number((fraction + '000').slice(0, 3));

    let offsetMinutes = 0;
    if (offsetToken !== undefined) {
      const parsed = offsetToMinutes(offsetToken);
      if (parsed === null) {
        return { ok: false, reason: `Timestamp "${raw}" has an invalid UTC offset` };
      }
      offsetMinutes = parsed;
    }

    const epochMs =
      Date.UTC(year, month - 1, day, hour, minute, second, millis) - offsetMinutes * 60_000;

    return { ok: true, value: new Date(epochMs) };
  },
};

/**
 * Stream boolean codec (Requirement 2.6, Property 5).
 *
 * Trims and lower-cases the value, mapping `t`/`true`/`1` to true and
 * `f`/`false`/`0` to false. Any other non-empty value is a conversion failure.
 */
const TRUE_TOKENS = new Set(['t', 'true', '1']);
const FALSE_TOKENS = new Set(['f', 'false', '0']);

export const streamBool: FieldCodec<boolean> = {
  parse(raw: string): CodecResult<boolean> {
    const token = raw.trim().toLowerCase();
    if (TRUE_TOKENS.has(token)) {
      return { ok: true, value: true };
    }
    if (FALSE_TOKENS.has(token)) {
      return { ok: true, value: false };
    }
    return { ok: false, reason: `Expected a boolean token (t/true/1 or f/false/0), got "${raw}"` };
  },
};

/**
 * Text codec (Requirements 2.7, 2.8, Property 6).
 *
 * Trims leading/trailing whitespace and treats an empty or whitespace-only
 * value as `null` (an empty optional field). Otherwise returns the trimmed
 * string. This codec never fails.
 */
export const text: FieldCodec<string | null> = {
  parse(raw: string): CodecResult<string | null> {
    const trimmed = raw.trim();
    return { ok: true, value: trimmed.length === 0 ? null : trimmed };
  },
};
