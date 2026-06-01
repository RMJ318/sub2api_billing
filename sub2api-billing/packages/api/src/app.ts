import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Builds the Fastify application instance. Routes for dashboard, user, model,
 * key, and cost aggregates, request-detail paging, signals/insights, and export
 * are registered by subsequent tasks. A `/health` route is provided so the
 * server can be smoke-tested today.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
