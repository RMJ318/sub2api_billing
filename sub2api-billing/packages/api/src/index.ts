/**
 * @app/api - Fastify HTTP API surface for the analytics platform.
 *
 * Exposes the query/export endpoints that shape compute outputs into DTOs for
 * the web UI. Implemented incrementally by subsequent tasks.
 */
export { buildApp } from './app.js';
export const API_PACKAGE = '@app/api' as const;
