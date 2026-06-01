import { defineConfig } from 'vitest/config';

/**
 * Root Vitest configuration. Each workspace package contributes its own
 * `vitest.config.ts` (which extends the shared base in `vitest.shared.ts`).
 * Running `vitest` / `npm test` from the root discovers and runs them all.
 */
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
