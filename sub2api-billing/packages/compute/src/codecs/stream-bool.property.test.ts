import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { streamBool } from './field-codecs.js';

/**
 * Property 5: Stream boolean parsing maps accepted tokens and rejects others.
 *
 * For any case variation and surrounding whitespace of `t`/`true`/`1` the
 * stream codec returns true, for any case variation and surrounding whitespace
 * of `f`/`false`/`0` it returns false, and for any other non-empty value it
 * reports a conversion failure.
 *
 * **Validates: Requirements 2.6**
 */
describe('Property 5: streamBool codec maps accepted tokens and rejects others', () => {
  // Whitespace padding generator (spaces, tabs, newlines, etc.)
  const whitespace = fc.stringMatching(/^[ \t\n\r\f\v]*$/);

  /**
   * Generator for truthy token strings: one of `t`, `true`, `1` in any case
   * combination, wrapped in random surrounding whitespace.
   */
  const trueToken: fc.Arbitrary<string> = fc
    .tuple(
      whitespace,
      fc.oneof(
        // All case variations of 't'
        fc.constantFrom('t', 'T'),
        // Case variations of 'true'
        fc.constantFrom('true', 'True', 'TRUE', 'tRuE', 'TrUe'),
        // '1' has no case
        fc.constant('1'),
      ),
      whitespace,
    )
    .map(([left, token, right]) => left + token + right);

  /**
   * Generator for falsy token strings: one of `f`, `false`, `0` in any case
   * combination, wrapped in random surrounding whitespace.
   */
  const falseToken: fc.Arbitrary<string> = fc
    .tuple(
      whitespace,
      fc.oneof(
        // All case variations of 'f'
        fc.constantFrom('f', 'F'),
        // Case variations of 'false'
        fc.constantFrom('false', 'False', 'FALSE', 'fAlSe', 'FaLsE'),
        // '0' has no case
        fc.constant('0'),
      ),
      whitespace,
    )
    .map(([left, token, right]) => left + token + right);

  /**
   * Generator for invalid boolean strings: arbitrary non-empty strings that,
   * after trimming and lowering, are NOT one of the accepted tokens.
   */
  const ACCEPTED_TOKENS = new Set(['t', 'true', '1', 'f', 'false', '0']);

  const invalidToken: fc.Arbitrary<string> = fc
    .string({ minLength: 1 })
    .filter((s) => {
      const normalized = s.trim().toLowerCase();
      return normalized.length > 0 && !ACCEPTED_TOKENS.has(normalized);
    });

  it('parses any case variation of t/true/1 (with whitespace) to true', () => {
    fc.assert(
      fc.property(trueToken, (raw) => {
        const result = streamBool.parse(raw);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(true);
        }
      }),
    );
  });

  it('parses any case variation of f/false/0 (with whitespace) to false', () => {
    fc.assert(
      fc.property(falseToken, (raw) => {
        const result = streamBool.parse(raw);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(false);
        }
      }),
    );
  });

  it('reports a conversion failure for any other non-empty value', () => {
    fc.assert(
      fc.property(invalidToken, (raw) => {
        const result = streamBool.parse(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(typeof result.reason).toBe('string');
          expect(result.reason.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});
