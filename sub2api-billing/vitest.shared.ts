import type { UserWorkspaceConfig } from 'vitest/config';

/**
 * Shared Vitest + fast-check configuration for all packages in the monorepo.
 *
 * Property-based tests use `fast-check` and, per the design's Testing Strategy,
 * run a minimum of 100 generated cases. The default number of runs is exposed
 * here so individual property tests can rely on a consistent baseline via
 * `fc.configureGlobal` (see `test/setup/fast-check.setup.ts`).
 */
export const FAST_CHECK_MIN_RUNS = 100;

/**
 * Base test options shared by every package project. Node-environment packages
 * (compute/ingest/store/api) use this directly; the web package overrides the
 * environment to `jsdom`.
 */
export const sharedTestConfig: UserWorkspaceConfig['test'] = {
  globals: true,
  environment: 'node',
  include: ['src/**/*.{test,spec}.ts', 'test/**/*.{test,spec}.ts'],
  setupFiles: [new URL('./test/setup/fast-check.setup.ts', import.meta.url).pathname],
};
