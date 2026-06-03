import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { detectApiKeyAnomaly } from './signals.js';

/**
 * Property 38: API key anomalies trigger above 3x the daily average.
 *
 * Design statement: "For any API key's sequence of daily request counts within
 * a Billing_Month, an API key anomaly is produced for a day if and only if that
 * day's request count exceeds 3 times the key's average daily request count for
 * the month, and the anomaly identifies the key, the owning user, and the date."
 *
 * Validates: Requirements 17.3
 *
 * The generator produces a map of 1–5 API keys, each with 1–30 daily request
 * counts drawn from a range that naturally creates both trigger and non-trigger
 * scenarios. We verify:
 * 1. A signal IS emitted for every day that strictly exceeds 3× the average.
 * 2. NO signal is emitted for days at or below 3× the average.
 * 3. Every emitted signal has group='api_key_anomaly' and severity='warning'.
 */

/**
 * Arbitrary: a map from key IDs to arrays of non-negative daily request counts.
 * The count range [0, 200] with array lengths [1, 30] ensures meaningful
 * averages and natural spike scenarios.
 */
const keyDailyCountsArb: fc.Arbitrary<Map<string, number[]>> = fc
  .array(
    fc.tuple(
      fc.string({ minLength: 1, maxLength: 10 }).map((s) => `key-${s}`),
      fc.array(fc.nat({ max: 200 }), { minLength: 1, maxLength: 30 }),
    ),
    { minLength: 1, maxLength: 5 },
  )
  .map((entries) => new Map(entries));

describe('detectApiKeyAnomaly (Property 38: trigger above 3x daily average)', () => {
  it('emits a signal if and only if a day strictly exceeds 3x the key average, with correct group and severity', () => {
    fc.assert(
      fc.property(keyDailyCountsArb, (keyMap) => {
        const signals = detectApiKeyAnomaly(keyMap);

        // For each key, compute expected triggering days.
        let expectedSignalCount = 0;

        for (const [keyId, dailyCounts] of keyMap) {
          if (dailyCounts.length === 0) continue;

          const total = dailyCounts.reduce((sum, c) => sum + c, 0);
          const avg = total / dailyCounts.length;

          // If average is 0 (all days are 0), no anomaly can trigger
          // because 0 > 0 is false for any day.
          if (avg <= 0) {
            // No signals expected from this key — all counts are 0.
            const keySignals = signals.filter(
              (s) => s.target.entityId === keyId,
            );
            expect(keySignals).toHaveLength(0);
            continue;
          }

          const threshold = avg * 3;

          for (let i = 0; i < dailyCounts.length; i++) {
            const count = dailyCounts[i]!;
            if (count > threshold) {
              expectedSignalCount++;
            }
          }

          // Verify signals for this key match expected count.
          const keySignals = signals.filter(
            (s) => s.target.entityId === keyId,
          );

          const expectedForKey = dailyCounts.filter((c) => c > threshold).length;
          expect(keySignals).toHaveLength(expectedForKey);
        }

        // Total signal count matches.
        expect(signals).toHaveLength(expectedSignalCount);

        // Every signal has the correct group and severity.
        for (const signal of signals) {
          expect(signal.group).toBe('api_key_anomaly');
          expect(signal.severity).toBe('warning');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('emits no signals when all days are at or below 3x the average', () => {
    // Generate uniform daily counts where no single day can exceed 3x average.
    const uniformCountsArb: fc.Arbitrary<Map<string, number[]>> = fc
      .array(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 8 }).map((s) => `key-${s}`),
          fc.integer({ min: 1, max: 100 }).chain((baseVal) =>
            // All days have the same count → average = count → no day > 3× average.
            fc
              .integer({ min: 2, max: 20 })
              .map((len) => Array.from({ length: len }, () => baseVal)),
          ),
        ),
        { minLength: 1, maxLength: 5 },
      )
      .map((entries) => new Map(entries));

    fc.assert(
      fc.property(uniformCountsArb, (keyMap) => {
        const signals = detectApiKeyAnomaly(keyMap);
        expect(signals).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
