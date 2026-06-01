import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { moneyUsd, tokenCount, timestampTz, streamBool, text } from './field-codecs.js';

describe('moneyUsd codec (Req 2.3)', () => {
  it('parses integers, decimals, and signs preserving fractional digits', () => {
    const cases: Array<[string, string]> = [
      ['5', '5'],
      ['5.5', '5.5'],
      ['+5', '5'],
      ['-0.5', '-0.5'],
      ['.5', '0.5'],
      ['5.', '5'],
      ['1000.00000000', '1000'],
      ['433.930721', '433.930721'],
      ['0.000000', '0'],
    ];
    for (const [raw, expected] of cases) {
      const result = moneyUsd.parse(raw);
      expect(result.ok, `expected "${raw}" to parse`).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Decimal);
        expect(result.value.toString()).toBe(expected);
      }
    }
  });

  it('preserves trailing fractional zeros as precision', () => {
    const result = moneyUsd.parse('1000.00000000');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The value equals 1000 even though the source carried trailing zeros.
      expect(result.value.equals(new Decimal('1000'))).toBe(true);
    }
  });

  it('rejects non-numeric, exponential, and multi-separator values', () => {
    for (const raw of ['abc', '1e3', '1.2.3', '1,000', '1 000', 'NaN', '0x10', '--5', '+', '.', '']) {
      const result = moneyUsd.parse(raw);
      expect(result.ok, `expected "${raw}" to fail`).toBe(false);
    }
  });
});

describe('tokenCount codec (Req 2.4)', () => {
  it('parses non-negative integers', () => {
    for (const [raw, expected] of [
      ['0', 0],
      ['42', 42],
      ['16726784', 16726784],
    ] as const) {
      const result = tokenCount.parse(raw);
      expect(result.ok, `expected "${raw}" to parse`).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expected);
      }
    }
  });

  it('rejects negative, fractional, signed, and non-numeric values', () => {
    for (const raw of ['-1', '1.5', '+1', '1e3', 'abc', ' 1', '1 ', '', '0x1']) {
      const result = tokenCount.parse(raw);
      expect(result.ok, `expected "${raw}" to fail`).toBe(false);
    }
  });
});

describe('timestampTz codec (Req 2.5)', () => {
  it('preserves an explicit UTC offset', () => {
    const result = timestampTz.parse('2026-05-22 15:53:45.925156+08');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 15:53:45.925 at +08 == 07:53:45.925 UTC.
      expect(result.value.toISOString()).toBe('2026-05-22T07:53:45.925Z');
    }
  });

  it('handles colon-separated and Z offsets', () => {
    const colon = timestampTz.parse('2026-05-22T15:53:45+08:00');
    const zulu = timestampTz.parse('2026-05-22T07:53:45Z');
    expect(colon.ok && zulu.ok).toBe(true);
    if (colon.ok && zulu.ok) {
      expect(colon.value.toISOString()).toBe('2026-05-22T07:53:45.000Z');
      expect(zulu.value.toISOString()).toBe('2026-05-22T07:53:45.000Z');
    }
  });

  it('interprets a value with no offset as UTC', () => {
    const dateTime = timestampTz.parse('2026-05-22 15:53:45');
    const dateOnly = timestampTz.parse('2026-05-22');
    expect(dateTime.ok && dateOnly.ok).toBe(true);
    if (dateTime.ok && dateOnly.ok) {
      expect(dateTime.value.toISOString()).toBe('2026-05-22T15:53:45.000Z');
      expect(dateOnly.value.toISOString()).toBe('2026-05-22T00:00:00.000Z');
    }
  });

  it('rejects malformed timestamps and out-of-range components', () => {
    for (const raw of ['not-a-date', '2026-13-01', '2026-05-32', '2026-05-22 25:00:00', '', '2026/05/22']) {
      const result = timestampTz.parse(raw);
      expect(result.ok, `expected "${raw}" to fail`).toBe(false);
    }
  });
});

describe('streamBool codec (Req 2.6)', () => {
  it('maps true tokens case-insensitively with surrounding whitespace', () => {
    for (const raw of ['t', 'T', 'true', 'TRUE', 'True', '1', '  true  ', ' 1 ']) {
      const result = streamBool.parse(raw);
      expect(result.ok, `expected "${raw}" to parse`).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    }
  });

  it('maps false tokens case-insensitively with surrounding whitespace', () => {
    for (const raw of ['f', 'F', 'false', 'FALSE', 'False', '0', '  false  ', ' 0 ']) {
      const result = streamBool.parse(raw);
      expect(result.ok, `expected "${raw}" to parse`).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    }
  });

  it('rejects other non-empty values', () => {
    for (const raw of ['yes', 'no', '2', 'tt', 'truee', 'on', 'off']) {
      const result = streamBool.parse(raw);
      expect(result.ok, `expected "${raw}" to fail`).toBe(false);
    }
  });
});

describe('text codec (Req 2.7, 2.8)', () => {
  it('trims and returns non-empty strings', () => {
    const result = text.parse('  hello world  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('hello world');
    }
  });

  it('returns null for empty or whitespace-only values', () => {
    for (const raw of ['', '   ', '\t', '\n', ' \t\n ']) {
      const result = text.parse(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value, `expected "${raw}" to be null`).toBeNull();
      }
    }
  });
});
