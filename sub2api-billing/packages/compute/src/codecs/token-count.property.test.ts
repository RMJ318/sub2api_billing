import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { tokenCount } from './field-codecs.js';

/**
 * Property 3: Token and count fields parse to non-negative integers or fail.
 *
 * For any non-negative integer string the token/count codec produces the
 * corresponding integer; for any negative, fractional, or non-numeric non-empty
 * string the codec reports a conversion failure.
 *
 * **Validates: Requirements 2.4**
 */
describe('Property 3: token/count codec parses non-negative integers or fails', () => {
  /**
   * Accept class: strings consisting solely of digits (a non-negative integer,
   * optionally with leading zeros). These must parse to the integer they
   * denote. Values are constrained to the safe-integer range so the numeric
   * round-trip is exact.
   */
  const nonNegativeIntegerString: fc.Arbitrary<{ raw: string; value: number }> = fc
    .tuple(
      fc.maxSafeNat(), // 0 .. 2^53-1, the integer the string denotes
      fc.nat({ max: 4 }), // count of leading zeros to exercise `\d+` tolerance
    )
    .map(([n, leadingZeros]) => ({
      raw: '0'.repeat(leadingZeros) + n.toString(),
      value: n,
    }));

  it('parses any non-negative integer string to the corresponding integer', () => {
    fc.assert(
      fc.property(nonNegativeIntegerString, ({ raw, value }) => {
        const result = tokenCount.parse(raw);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(Number.isInteger(result.value)).toBe(true);
          expect(result.value).toBeGreaterThanOrEqual(0);
          expect(result.value).toBe(value);
        }
      }),
    );
  });

  /**
   * Reject class: negative, signed-positive, fractional, and non-numeric
   * non-empty strings. Each sub-generator is constrained to its class, and the
   * combined generator is filtered to guarantee it never accidentally produces
   * a bare non-negative integer string (the accept class) or an empty string.
   */
  const negativeIntegerString = fc.maxSafeNat().map((n) => `-${n}`);
  const signedPositiveString = fc.maxSafeNat().map((n) => `+${n}`);
  const fractionalString = fc
    .tuple(fc.maxSafeNat(), fc.maxSafeNat())
    .map(([whole, frac]) => `${whole}.${frac}`);
  // Non-numeric: arbitrary non-empty strings that are not a bare digit run.
  const nonNumericString = fc.string({ minLength: 1 });

  const invalidTokenString: fc.Arbitrary<string> = fc
    .oneof(
      negativeIntegerString,
      signedPositiveString,
      fractionalString,
      nonNumericString,
    )
    // Stay strictly inside the reject class: non-empty and not a bare integer.
    .filter((s) => s.length > 0 && !/^\d+$/.test(s));

  it('reports a conversion failure for negative, fractional, signed, or non-numeric strings', () => {
    fc.assert(
      fc.property(invalidTokenString, (raw) => {
        const result = tokenCount.parse(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(typeof result.reason).toBe('string');
          expect(result.reason.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});
