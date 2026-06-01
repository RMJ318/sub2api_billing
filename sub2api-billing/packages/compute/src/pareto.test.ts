import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import { paretoShares } from './index.js';
import type { ParetoShares } from './index.js';

/**
 * Example unit tests for `paretoShares` (Requirement 14.1).
 *
 * These pin down the worked Pareto math, the `Math.ceil` user-count cutoffs,
 * and the defined-zero edge cases on concrete inputs. The universal invariants
 * (monotonic and bounded shares) are covered separately by Property 28
 * (task 8.4).
 */

const d = (v: string | number): Decimal => new Decimal(v);

describe('paretoShares - cumulative top-10/20/30 percent shares', () => {
  it('reports 0 for every band on empty input', () => {
    expect(paretoShares([])).toEqual({ top10: 0, top20: 0, top30: 0 });
  });

  it('reports 100 for every band for a single user', () => {
    // ceil(0.1*1) = ceil(0.2*1) = ceil(0.3*1) = 1, so all bands hold the one user.
    expect(paretoShares([d('250.5')])).toEqual({ top10: 100, top20: 100, top30: 100 });
  });

  it('ceils fractional cutoffs so each band has at least one user', () => {
    // 10 users, spends 100..10 descending; total = 550.
    const spends = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map(d);
    const shares = paretoShares(spends);
    // top 10% -> ceil(1.0) = 1 user (100): 100/550 ~ 18.18%
    expect(shares.top10).toBeCloseTo(18.1818, 3);
    // top 20% -> ceil(2.0) = 2 users (100+90=190): 190/550 ~ 34.55%
    expect(shares.top20).toBeCloseTo(34.5455, 3);
    // top 30% -> ceil(3.0) = 3 users (100+90+80=270): 270/550 ~ 49.09%
    expect(shares.top30).toBeCloseTo(49.0909, 3);
  });

  it('ranks by Spend descending regardless of input order', () => {
    const ascending = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(d);
    const descending = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map(d);
    expect(paretoShares(ascending)).toEqual(paretoShares(descending));
  });

  it('produces monotonic non-decreasing shares (top10 <= top20 <= top30)', () => {
    const spends = [500, 5, 4, 3, 2, 1, 1].map(d);
    const shares: ParetoShares = paretoShares(spends);
    expect(shares.top10).toBeLessThanOrEqual(shares.top20);
    expect(shares.top20).toBeLessThanOrEqual(shares.top30);
  });

  it('defines all shares as 0 when total Spend is 0', () => {
    expect(paretoShares([d(0), d(0), d(0)])).toEqual({ top10: 0, top20: 0, top30: 0 });
  });

  it('does not mutate the caller input array', () => {
    const spends = [d(10), d(100), d(50)];
    const snapshot = spends.map((s) => s.toString());
    paretoShares(spends);
    expect(spends.map((s) => s.toString())).toEqual(snapshot);
  });
});
