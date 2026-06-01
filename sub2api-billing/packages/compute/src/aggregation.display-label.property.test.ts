import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { displayLabel } from './index.js';

/**
 * Property 19: Display label falls back from username to email.
 *
 * For any record, the display label is the `username` when it is non-empty and
 * the `email` otherwise. "Non-empty" follows the platform's notion of empty
 * (Requirement 2.7): a `null`, empty, or whitespace-only value is treated as
 * empty, so a user with a blank username is labelled by their email, and a user
 * with neither gets the empty string.
 *
 * Validates: Requirements 5.2, 7.5
 */
describe('Property 19: displayLabel falls back from username to email', () => {
  // A "present" string: non-empty and not whitespace-only, so it survives the
  // .trim() emptiness check inside displayLabel.
  const present = fc
    .string({ minLength: 1 })
    .filter((s) => s.trim() !== '');

  // An "absent" value: null, the empty string, or whitespace-only text. These
  // are all treated as empty by the platform's emptiness rule.
  const whitespace = fc
    .stringMatching(/^[ \t\n\r\f\v]*$/)
    .filter((s) => s.trim() === '');
  const absent = fc.oneof(
    fc.constant<string | null>(null),
    fc.constant<string | null>(''),
    whitespace as fc.Arbitrary<string | null>,
  );

  // Either present or absent, covering the full input space for a field.
  const field = fc.oneof(present as fc.Arbitrary<string | null>, absent);

  it('returns the username whenever the username is present', () => {
    fc.assert(
      fc.property(present, field, (username, email) => {
        expect(displayLabel(username, email)).toBe(username);
      }),
      { numRuns: 100 },
    );
  });

  it('falls back to the email when the username is absent but the email is present', () => {
    fc.assert(
      fc.property(absent, present, (username, email) => {
        expect(displayLabel(username, email)).toBe(email);
      }),
      { numRuns: 100 },
    );
  });

  it('returns the empty string when both username and email are absent', () => {
    fc.assert(
      fc.property(absent, absent, (username, email) => {
        expect(displayLabel(username, email)).toBe('');
      }),
      { numRuns: 100 },
    );
  });

  it('always returns a string and never an absent value', () => {
    fc.assert(
      fc.property(field, field, (username, email) => {
        const label = displayLabel(username, email);
        expect(typeof label).toBe('string');
      }),
      { numRuns: 100 },
    );
  });
});
