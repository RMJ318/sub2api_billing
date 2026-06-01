import { buildApp } from './app.js';

/**
 * API server entry point. Network-exposed endpoints can surface user-level
 * spend and request detail; per the design this is an internal-only tool and
 * deployment SHOULD restrict access at the network/reverse-proxy layer. No
 * authentication layer is described in the requirements.
 */
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  const app = buildApp();
  await app.listen({ port: PORT, host: HOST });
  // eslint-disable-next-line no-console
  console.log(`API listening on http://${HOST}:${PORT}`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
