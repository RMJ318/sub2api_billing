/**
 * @app/api - Fastify HTTP API surface for the analytics platform.
 *
 * Exposes the query/export endpoints that shape compute outputs into DTOs for
 * the web UI. Routes include dashboard, user, model, key, cost aggregates,
 * request-detail paging, signals/insights, and export.
 */
export { buildApp } from './app.js';
export type { AppDependencies } from './app.js';
export const API_PACKAGE = '@app/api' as const;
