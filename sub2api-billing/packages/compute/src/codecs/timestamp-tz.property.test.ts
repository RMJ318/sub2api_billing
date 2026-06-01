import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { timestampTz } from './field-codecs.js';

/**
 * Property 4: Timestamp parsing preserves offset or assumes UTC.
 *
 * For any timestamp string that includes a UTC offset, the timestamp codec
 * produces an instant equal to the value at that offset; for any timestamp
 * string without an offset, the codec produces the instant interpreting the
 * value as UTC.
 *
 * **Validates: Requirements 2.5**
 */

/** Left-pad a non-negative integer to a fixed width of zeros. */
function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * A wall-clock date/time with no zone information. Days are limited to 1-28 so
 * every (year, month, day) triple is a real calendar date regardless of month,
 * and years start at 1000 so the four-digit format is natural and free of the
 * `Date.UTC` two-digit-year (1900+) remapping.
 */
const wallClockArb = fc.record({
  year: fc.integer({ min: 1000, max: 9999 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 }),
  hour: fc.integer({ min: 0, max: 23 }),
  minute: fc.integer({ min: 0, max: 59 }),
  second: fc.integer({ min: 0, max: 59 }),
  millis: fc.integer({ min: 0, max: 999 }),
  includeFraction: fc.boolean(),
  // The documented data uses both a space and a `T` between date and time.
  separator: fc.constantFrom(' ', 'T'),
});

type WallClock = typeof wallClockArb extends fc.Arbitrary<infer T> ? T : never;

/** A UTC offset together with its value in signed minutes east of UTC. */
interface Offset {
  token: string;
  totalMinutes: number;
}

/**
 * Signed numeric offsets in the formats the codec accepts (`+08`, `-0530`,
 * `+08:30`). Hours range 0-14 and minutes 0-59, matching the codec's
 * acceptance bounds.
 */
const signedOffsetArb: fc.Arbitrary<Offset> = fc
  .record({
    sign: fc.constantFrom('+', '-'),
    hours: fc.integer({ min: 0, max: 14 }),
    minutes: fc.integer({ min: 0, max: 59 }),
    format: fc.constantFrom('HH', 'HHMM', 'HH:MM'),
  })
  .map(({ sign, hours, minutes, format }) => {
    const hh = pad(hours, 2);
    const mm = pad(minutes, 2);
    let body: string;
    if (format === 'HH') {
      body = hh;
    } else if (format === 'HHMM') {
      body = `${hh}${mm}`;
    } else {
      body = `${hh}:${mm}`;
    }
    const magnitude = format === 'HH' ? hours * 60 : hours * 60 + minutes;
    return {
      token: `${sign}${body}`,
      totalMinutes: sign === '-' ? -magnitude : magnitude,
    };
  });

/** Offsets including the zero-offset `Z` designator alongside numeric forms. */
const offsetArb: fc.Arbitrary<Offset> = fc.oneof(
  fc.constant<Offset>({ token: 'Z', totalMinutes: 0 }),
  signedOffsetArb,
);

/** Render the offset-free portion of a timestamp from its components. */
function formatBase(c: WallClock): string {
  const date = `${pad(c.year, 4)}-${pad(c.month, 2)}-${pad(c.day, 2)}`;
  const time = `${pad(c.hour, 2)}:${pad(c.minute, 2)}:${pad(c.second, 2)}`;
  const frac = c.includeFraction ? `.${pad(c.millis, 3)}` : '';
  return `${date}${c.separator}${time}${frac}`;
}

/** The wall-clock instant interpreted as UTC, in epoch milliseconds. */
function utcEpochMs(c: WallClock): number {
  const millis = c.includeFraction ? c.millis : 0;
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second, millis);
}

describe('Property 4: timestampTz preserves offset or assumes UTC (Req 2.5)', () => {
  it('maps an explicit offset to the correct UTC instant (offset preserved)', () => {
    fc.assert(
      fc.property(wallClockArb, offsetArb, (clock, offset) => {
        const raw = `${formatBase(clock)}${offset.token}`;
        const result = timestampTz.parse(raw);

        expect(result.ok, `expected "${raw}" to parse`).toBe(true);
        if (result.ok) {
          // The wall-clock time at offset O equals (UTC wall-clock - O).
          const expected = utcEpochMs(clock) - offset.totalMinutes * 60_000;
          expect(result.value.getTime()).toBe(expected);
        }
      }),
    );
  });

  it('interprets a value with no offset as UTC', () => {
    fc.assert(
      fc.property(wallClockArb, (clock) => {
        const raw = formatBase(clock);
        const result = timestampTz.parse(raw);

        expect(result.ok, `expected "${raw}" to parse`).toBe(true);
        if (result.ok) {
          expect(result.value.getTime()).toBe(utcEpochMs(clock));
        }
      }),
    );
  });

  it('shifts the same wall-clock time by exactly the offset relative to UTC', () => {
    fc.assert(
      fc.property(wallClockArb, offsetArb, (clock, offset) => {
        const base = formatBase(clock);
        const withOffset = timestampTz.parse(`${base}${offset.token}`);
        const noOffset = timestampTz.parse(base);

        expect(withOffset.ok && noOffset.ok).toBe(true);
        if (withOffset.ok && noOffset.ok) {
          // Adding an east-of-UTC offset moves the instant earlier in UTC.
          expect(withOffset.value.getTime()).toBe(
            noOffset.value.getTime() - offset.totalMinutes * 60_000,
          );
        }
      }),
    );
  });
});
