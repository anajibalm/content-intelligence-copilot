import { randomUUID } from 'node:crypto';
import { createDefaultAcquirer } from '../lib/acquisition/index.ts';
import { createPostgresRuntimeFromEnv } from '../lib/runtime/postgres.ts';

const workerId = `cic-worker-${process.pid}-${randomUUID()}`;
const once = process.argv.includes('--once');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runtime = createPostgresRuntimeFromEnv(createDefaultAcquirer());
try {
  await runtime.recover(workerId);
  do {
    const job = await runtime.runOne(workerId);
    if (!job) {
      if (once) break;
      await sleep(1000);
    }
  } while (!once);
} finally {
  await runtime.close();
}
