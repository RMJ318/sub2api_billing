import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { budgetStyle } from './budget.js';
import type { BudgetStyle } from './budget.js';

/**
 * Property 27: Budget style follows the usage-percent thresholds.
 *
 * For any Usage_Percent value:
 * - Usage_Percent < 80 → normal style
 * - Usage_Percent >= 80 and < 95 → warning style
 * - Usage_Percent >= 95 → critical style
 *
 * **Validates: Requirements 9.2, 9.3**
 */

// --- Smart generators constrained to each threshold band ---

/** Usage_Percent values strictly below 80 (normal band). */
const normalRange = fc.double({ min: -1e6, max: 79.999999999, noNaN: true });

/** Usage_Percent values in the half-open interval [80, 95) (warning band). */
const warningRange = fc.double({ min: 80, max: 94.999999999, noNaN: true });

/** Usage_Percent values at 95 or above (critical band). */
const criticalRange = fc.double({ min: 95, max: 1e6, noNaN: true });

/** Any finite Usage_Percent value across the full range. */
const anyUsagePercent = fc.double({ min: -1e6, max: 1e6, noNaN: true });

const validStyles = new Set<BudgetStyle>(['normal', 'warning', 'critical']);

describe('Property 27: Budget style follows the usage-percent thresholds', () => {
  it('returns exactly one of the three BudgetStyle bands for any usage percent', () => {
    fc.assert(
      fc.property(anyUsagePercent, (pct) => {
        const style = budgetStyle(pct);
        expect(validStyles.has(style)).toBe(true);
      }),
    );
  });

  it('returns normal when Usage_Percent < 80 (Req 9.2, 9.3)', () => {
    fc.assert(
      fc.property(normalRange, (pct) => {
        expect(budgetStyle(pct)).toBe('normal');
      }),
    );
  });

  it('returns warning when Usage_Percent >= 80 and < 95 (Req 9.2)', () => {
    fc.assert(
      fc.property(warningRange, (pct) => {
        expect(budgetStyle(pct)).toBe('warning');
      }),
    );
  });

  it('returns critical when Usage_Percent >= 95 (Req 9.3)', () => {
    fc.assert(
      fc.property(criticalRange, (pct) => {
        expect(budgetStyle(pct)).toBe('critical');
      }),
    );
  });

  it('partitions the real line into exactly three contiguous bands', () => {
    fc.assert(
      fc.property(anyUsagePercent, (pct) => {
        const style = budgetStyle(pct);
        if (pct < 80) {
          expect(style).toBe('normal');
        } else if (pct < 95) {
          expect(style).toBe('warning');
        } else {
          expect(style).toBe('critical');
        }
      }),
    );
  });
});
