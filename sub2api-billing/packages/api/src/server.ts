import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { InMemoryRecordStore, openRequestDetailDb } from '@core/store';
import { runIngestion, isValidBillingMonthFolder, streamRequestDetail } from '@core/ingest';
import { buildApp } from './app.js';

/**
 * API server entry point. Network-exposed endpoints can surface user-level
 * spend and request detail; per the design this is an internal-only tool and
 * deployment SHOULD restrict access at the network/reverse-proxy layer. No
 * authentication layer is described in the requirements.
 */
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';
const BILLING_ROOT_DIR = process.env.BILLING_ROOT_DIR ?? process.cwd();
const REQUEST_DETAIL_BATCH_SIZE = Number(process.env.REQUEST_DETAIL_BATCH_SIZE ?? 10_000);

async function findBillingMonthFolders(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && isValidBillingMonthFolder(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function loadRequestDetailData(
  billingRootDir: string,
  requestDetailBatchSize: number,
) {
  const connection = await openRequestDetailDb();
  const folders = await findBillingMonthFolders(billingRootDir);

  for (const folderName of folders) {
    const filePath = join(billingRootDir, folderName, 'request_detail.csv');
    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        continue;
      }
    } catch {
      continue;
    }

    await streamRequestDetail({
      connection,
      filePath,
      folderName,
      batchSize: requestDetailBatchSize,
    });
  }

  return connection;
}

async function main(): Promise<void> {
  const store = new InMemoryRecordStore();
  const ingestionResult = await runIngestion(
    {
      billingRootDir: BILLING_ROOT_DIR,
      requestDetailBatchSize: REQUEST_DETAIL_BATCH_SIZE,
    },
    store,
  );
  const duckDbConnection = await loadRequestDetailData(
    BILLING_ROOT_DIR,
    REQUEST_DETAIL_BATCH_SIZE,
  );
  const app = buildApp({ store, duckDbConnection });

  app.addHook('onClose', async () => {
    duckDbConnection.closeSync();
  });

  await app.listen({ port: PORT, host: HOST });
  // eslint-disable-next-line no-console
  console.log(`API listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(
    `Ingestion loaded ${ingestionResult.summary.recordsLoaded} records from ${ingestionResult.summary.foldersProcessed} folders under ${BILLING_ROOT_DIR}`,
  );
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
