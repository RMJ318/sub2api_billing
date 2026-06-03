import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { unreadCount } from './signals.js';
import type { Signal, SignalGroup, Severity } from './types/index.js';

/**
 * Property 42: The unread badge equals the count of unread signals.
 *
 * Design statement: "The unread badge count equals the number of signals where
 * read === false."
 *
 * The property validates:
 * 1. The unread count equals the number of signals where read === false.
 * 2. When all signals are read, the count is 0.
 * 3. When all signals are unread, the count equals the total number of signals.
 *
 * **Validates: Requirements 16.3**
 */

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a SignalGroup value. */
const signalGroupArb: fc.Arbitrary<SignalGroup> = fc.constantFrom(
  'high_spend',
  'low_balance',
  'api_key_anomaly',
  'response_time_anomaly',
  'risk_hint',
);

/** Generate a Severity value. */
const severityArb: fc.Arbitrary<Severity> = fc.constantFrom(
  'informational',
  'warning',
  'critical',
);

/** Generate a Signal with a configurable read state. */
function signalArb(read: fc.Arbitrary<boolean>): fc.Arbitrary<Signal> {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    group: signalGroupArb,
    severity: severityArb,
    message: fc.string({ minLength: 1, maxLength: 50 }),
    target: fc.record({
      page: fc.string({ minLength: 1, maxLength: 15 }),
      entityId: fc.string({ minLength: 1, maxLength: 10 }),
    }),
    read,
  });
}

/** Generate a list of signals with mixed read states. */
const mixedSignalsArb = fc.array(signalArb(fc.boolean()), { minLength: 0, maxLength: 50 });

/** Generate a list of signals where all are read (read === true). */
const allReadSignalsArb = fc.array(signalArb(fc.constant(true)), { minLength: 0, maxLength: 50 });

/** Generate a list of signals where all are unread (read === false). */
const allUnreadSignalsArb = fc.array(signalArb(fc.constant(false)), { minLength: 0, maxLength: 50 });

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property 42: The unread badge equals the count of unread signals', () => {
  it('unread count equals the number of signals where read === false', () => {
    fc.assert(
      fc.property(mixedSignalsArb, (signals) => {
        const expected = signals.filter(s => s.read === false).length;
        const result = unreadCount(signals);
        expect(result).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('when all signals are read, the count is 0', () => {
    fc.assert(
      fc.property(allReadSignalsArb, (signals) => {
        const result = unreadCount(signals);
        expect(result).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  it('when all signals are unread, the count equals the total number of signals', () => {
    fc.assert(
      fc.property(allUnreadSignalsArb, (signals) => {
        const result = unreadCount(signals);
        expect(result).toBe(signals.length);
      }),
      { numRuns: 200 },
    );
  });
});
