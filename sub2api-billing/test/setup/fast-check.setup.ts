import fc from 'fast-check';
import { FAST_CHECK_MIN_RUNS } from '../../vitest.shared.js';

/**
 * Global fast-check configuration applied to every property-based test in the
 * monorepo. The design's Testing Strategy requires a minimum of 100 generated
 * cases per property; this baseline is set globally so individual tests do not
 * have to repeat it. `fc.assert(prop, { numRuns })` may still raise the count.
 */
fc.configureGlobal({
  numRuns: FAST_CHECK_MIN_RUNS,
});
