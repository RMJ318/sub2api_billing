import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { text } from './field-codecs.js';

/**
 * Property 6: Whitespace is trimmed and empty optional fields become null.
 *
 * For any field value, the `text` codec trims leading and trailing whitespace,
 * treats a value that is empty or whitespace-only as empty, and stores null for
 * such an empty (non-required) field. Otherwise it yields the trimmed string,
 * which by construction carries no leading or trailing whitespace.
 *
 * Validates: Requirements 2.7, 2.8
 */
describe('Property 6: text codec trims whitespace and maps empties to null', () => {
  // Whitespace runs (possibly empty) used to pad generated content. Includes
  // the common ASCII whitespace characters the platform considers blank.
  const whitespace = fc.stringMatching(/^[ \t\n\r\f\v]*$/);

  // Whitespace-only values (length >= 1), all of which must normalize to null.
  const whitespaceOnly = fc
    .stringMatching(/^[ \t\n\r\f\v]+$/)
    .filter((s) => s.trim() === '');

  // Arbitrary text wrapped in random surrounding whitespace, covering both
  // empty-after-trim and non-empty-after-trim cases.
  const padded = fc
    .tuple(whitespace, fc.string(), whitespace)
    .map(([left, core, right]) => left + core + right);

  it('never has leading or trailing whitespace and matches the trimmed input', () => {
    fc.assert(
      fc.property(padded, (raw) => {
        const result = text.parse(raw);
        // The codec is documented as total: it never reports a failure.
        expect(result.ok).toBe(true);
        if (result.ok) {
          const trimmed = raw.trim();
          if (trimmed.length === 0) {
            // Empty or whitespace-only input becomes a null (empty optional).
            expect(result.value).toBeNull();
          } else {
            // Otherwise it equals the trimmed input...
            expect(result.value).toBe(trimmed);
            // ...and carries no surrounding whitespace.
            expect(result.value).toBe(result.value?.trim());
          }
        }
      }),
    );
  });

  it('maps any empty or whitespace-only value to null', () => {
    const empties = fc.oneof(fc.constant(''), whitespaceOnly);
    fc.assert(
      fc.property(empties, (raw) => {
        const result = text.parse(raw);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBeNull();
        }
      }),
    );
  });

  it('returns a non-null trimmed string whenever the content is non-blank', () => {
    // Content that is guaranteed non-empty after trimming, wrapped in random
    // surrounding whitespace, must round-trip to its trimmed form.
    const nonBlank = fc
      .tuple(whitespace, fc.string({ minLength: 1 }).filter((s) => s.trim() !== ''), whitespace)
      .map(([left, core, right]) => left + core + right);

    fc.assert(
      fc.property(nonBlank, (raw) => {
        const result = text.parse(raw);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).not.toBeNull();
          expect(result.value).toBe(raw.trim());
        }
      }),
    );
  });
});
