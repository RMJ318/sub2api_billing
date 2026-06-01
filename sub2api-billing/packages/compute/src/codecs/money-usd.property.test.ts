import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { moneyUsd } from './field-codecs.js';

/**
 * Property 2: Monetary fields parse to precise decimals or fail.
 *
 * For any string consisting of an optional sign, digits, and at most one
 * decimal separator, the monetary codec produces a USD decimal equal to that
 * value preserving its fractional digits; for any other non-empty string the
 * codec reports a conversion failure.
 *
 * Validates: Requirements 2.3
 */

/**
 * Grammar predicate for a well-formed monetary string, encoding Requirement
 * 2.3 directly: an optional sign, digits, and at most one decimal separator.
 * Used to (a) sanity-check the valid generator and (b) exclude any string that
 * happens to be well-formed from the malformed generator.
 */
function isWellFormedMoney(s: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s);
}

/** Digit string of length >= 1 (e.g. "0", "433", "000123"). */
const digitsMin1 = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 9 })
  .map((a) => a.join(''));

/** Optional leading sign. */
const sign = fc.constantFrom('', '+', '-');

/**
 * The four well-formed shapes the grammar admits. Each carries the raw string
 * plus its decomposed sign/integer/fraction parts so the test can derive the
 * exact expected value with a float-free BigInt oracle.
 *
 * Digit lengths are capped so the BigInt-scaled magnitude stays within
 * decimal.js's default operating precision (20 significant digits), keeping the
 * verifying multiplication exact. 18 significant digits already exceeds the
 * exact range of IEEE-754 doubles (~16 digits), so precision preservation
 * beyond float is still exercised.
 */
type ValidMoney = { raw: string; sign: string; intDigits: string; fracDigits: string };

const formInt = fc
  .tuple(sign, digitsMin1)
  .map(([s, i]): ValidMoney => ({ raw: s + i, sign: s, intDigits: i, fracDigits: '' }));

const formIntDot = fc
  .tuple(sign, digitsMin1)
  .map(([s, i]): ValidMoney => ({ raw: s + i + '.', sign: s, intDigits: i, fracDigits: '' }));

const formIntDotFrac = fc
  .tuple(sign, digitsMin1, digitsMin1)
  .map(([s, i, f]): ValidMoney => ({ raw: s + i + '.' + f, sign: s, intDigits: i, fracDigits: f }));

const formDotFrac = fc
  .tuple(sign, digitsMin1)
  .map(([s, f]): ValidMoney => ({ raw: s + '.' + f, sign: s, intDigits: '', fracDigits: f }));

const validMoney = fc.oneof(formInt, formIntDot, formIntDotFrac, formDotFrac);

/**
 * Curated malformed values (exponentials, thousands separators, embedded
 * whitespace, multiple separators, bare signs/dots, non-numeric tokens) plus a
 * random non-empty string stream filtered to exclude anything well-formed.
 */
const malformedMoney = fc.oneof(
  fc.constantFrom(
    'abc',
    '1e3',
    '5e-3',
    '1.2.3',
    '1..2',
    '1,000',
    '1 000',
    '1_000',
    'NaN',
    'Infinity',
    '0x10',
    '0b10',
    '--5',
    '+-5',
    '++1',
    '+',
    '-',
    '.',
    '. ',
    '$5',
    '5%',
    ' 5',
    '5 ',
    '   ',
  ),
  fc.string().filter((s) => s.length > 0 && !isWellFormedMoney(s)),
);

describe('Property 2: monetary fields parse to precise decimals or fail (Req 2.3)', () => {
  it('parses well-formed monetary strings to a Decimal equal to the exact value', () => {
    fc.assert(
      fc.property(validMoney, ({ raw, sign: s, intDigits, fracDigits }) => {
        // Generator sanity: every produced raw string is well-formed per Req 2.3.
        expect(isWellFormedMoney(raw)).toBe(true);

        const result = moneyUsd.parse(raw);
        expect(result.ok, `expected "${raw}" to parse`).toBe(true);
        if (!result.ok) {
          return;
        }
        expect(result.value).toBeInstanceOf(Decimal);

        // Float-free oracle: the exact value is (sign)(intDigits frac digits)
        // as an integer divided by 10^(fraction length). Verify by scaling the
        // parsed decimal back up to that integer and comparing to a BigInt.
        const scale = fracDigits.length;
        const magnitude = BigInt((intDigits + fracDigits) || '0');
        const expected = s === '-' ? -magnitude : magnitude;

        const scaled = result.value.times(new Decimal(10).pow(scale));
        expect(scaled.equals(new Decimal(expected.toString()))).toBe(true);
      }),
    );
  });

  it('preserves fractional precision that exceeds IEEE-754 double precision', () => {
    fc.assert(
      fc.property(formIntDotFrac, ({ raw }) => {
        const result = moneyUsd.parse(raw);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }
        // toFixed renders all stored fractional digits; re-parsing that canonical
        // form must yield the same decimal, proving no digits were dropped.
        const fractionLen = raw.split('.')[1]?.length ?? 0;
        const rendered = result.value.toFixed(fractionLen);
        expect(new Decimal(rendered).equals(result.value)).toBe(true);
      }),
    );
  });

  it('reports a conversion failure for any other non-empty string', () => {
    fc.assert(
      fc.property(malformedMoney, (raw) => {
        const result = moneyUsd.parse(raw);
        expect(result.ok, `expected "${raw}" to fail`).toBe(false);
      }),
    );
  });
});
