import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { COMPUTE_PACKAGE } from './index.js';

describe('@core/compute tooling smoke test', () => {
  it('exposes the package identifier', () => {
    expect(COMPUTE_PACKAGE).toBe('@core/compute');
  });

  it('runs fast-check property assertions', () => {
    // Confirms fast-check + Vitest are wired together with the shared config.
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
    );
  });
});
