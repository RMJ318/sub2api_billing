import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import { usagePercent, budgetStyle } from './index.js';
import type { BudgetStyle } from './index.js';

/**
 * Example unit tests for `usagePercent` and `budgetStyle` (Requirements 9.2, 9.3).
 *
 * These pin down the worked Usage_Percent math and the threshold boundaries on
 * concrete inputs. The universal threshold invariant is covered separately by
 * Property 27 (task 8.2).
 */

describe('usagePercent', () => {
  it('computes used / limit * 100 (Req 9, 4.8)', () => {
    expect(usagePercent(new Decimal('250'), new Decimal('1000'))).toBe(25);
  });

  it('preserves fractional precision', () => {
    // 333.333 / 1000 * 100 = 33.3333
    expect(usagePercent(new Decimal('333.333'), new Decimal('1000'))).toBe(33.3333);
  });

  it('can exceed 100 when spend is over the limit', () => {
    expect(usagePercent(new Decimal('1200'), new Decimal('1000'))).toBe(120);
  });

  it('returns 0 when the limit is zero (mirrors Req 4.9)', () => {
    expect(usagePercent(new Decimal('50'), new Decimal('0'))).toBe(0);
  });

  it('returns 0 when both used and limit are zero', () => {
    expect(usagePercent(new Decimal('0'), new Decimal('0'))).toBe(0);
  });
});

describe('budgetStyle thresholds (Req 9.2, 9.3)', () => {
  it('is normal below 80', () => {
    expect(budgetStyle(0)).toBe('normal');
    expect(budgetStyle(79.9)).toBe('normal');
  });

  it('is warning on [80, 95)', () => {
    expect(budgetStyle(80)).toBe('warning');
    expect(budgetStyle(90)).toBe('warning');
    expect(budgetStyle(94.9)).toBe('warning');
  });

  it('is critical at 95 or above', () => {
    expect(budgetStyle(95)).toBe('critical');
    expect(budgetStyle(150)).toBe('critical');
  });

  it('returns one of the three BudgetStyle bands', () => {
    const styles: BudgetStyle[] = [budgetStyle(10), budgetStyle(85), budgetStyle(99)];
    expect(styles).toEqual(['normal', 'warning', 'critical']);
  });
});
