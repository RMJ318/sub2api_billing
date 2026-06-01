import { describe, it, expect } from 'vitest';
import { numeric } from './numeric-codec.js';

describe('numeric codec (general number fields)', () => {
  it('parses integers, decimals, and signs', () => {
    for (const [raw, expected] of [
      ['0', 0],
      ['43.39', 43.39],
      ['25290.74', 25290.74],
      ['-5', -5],
      ['+12', 12],
      ['.5', 0.5],
      ['5.', 5],
    ] as const) {
      const result = numeric.parse(raw);
      expect(result.ok, `expected "${raw}" to parse`).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expected);
      }
    }
  });

  it('rejects exponential, multi-separator, and non-numeric values', () => {
    for (const raw of ['abc', '1e3', '1.2.3', '1,000', '1 000', 'NaN', 'Infinity', '0x10', '', '+', '.']) {
      const result = numeric.parse(raw);
      expect(result.ok, `expected "${raw}" to fail`).toBe(false);
    }
  });
});
