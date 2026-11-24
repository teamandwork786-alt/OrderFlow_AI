import { PrismaClient } from '@prisma/client';
import { loadEnv } from './config/env.js';
import { PrismaAudit, PrismaInboxRepo, PrismaOrderRepo } from './db/prismaRepos.js';
import { PrismaMockStore } from './db/prismaMockStore.js';
import { MockShopifyAdapter } from './integrations/shopify/mock/mockAdapter.js';
import { reconcile } from './modules/sync/reconcile.js';
import { runWorkerTick, type ProcessorDeps } from './modules/webhooks-inbox/processor.js';

// The real adapter (SHOPIFY_ADAPTER=real) is still to be written: see plan.md, "S1 follow-ups".

const env = loadEnv();
const db = new PrismaClient();
if (env.SHOPIFY_ADAPTER === 'real') throw new Error('RealShopifyAdapter is not implemented yet');

const deps: ProcessorDeps = {
  adapter: new MockShopifyAdapter(new PrismaMockStore(db)),
  orders: new PrismaOrderRepo(db),
  inbox: new PrismaInboxRepo(db),
  audit: new PrismaAudit(db),
  now: () => new Date(),
  eligibility: { allowedGateways: env.SHOPIFY_ALLOWED_GATEWAYS?.split(',').filter(Boolean) },
  maxAttempts: env.WEBHOOK_MAX_ATTEMPTS,
};

const RECONCILE_LOCK = 724_001; // arbitrary application-wide advisory lock key
let lastReconcile = 0;

async function tick() {
  await db.workerHeartbeat.upsert({
    where: { workerName: 'worker' },
    update: { lastSeenAt: new Date() },
    create: { workerName: 'worker', lastSeenAt: new Date() },
  });
  await runWorkerTick(deps);
  if (Date.now() - lastReconcile >= env.RECONCILE_INTERVAL_MINUTES * 60_000) {
    lastReconcile = Date.now();
    // Only one worker runs a reconciliation cycle at a time.
    const [{ locked }] = await db.$queryRaw<[{ locked: boolean }]>`SELECT pg_try_advisory_lock(${RECONCILE_LOCK}) AS locked`;
    if (locked) {
      try {
        await reconcile(deps, env.RECONCILE_WINDOW_HOURS);
      } finally {
        await db.$queryRaw`SELECT pg_advisory_unlock(${RECONCILE_LOCK})`;
      }
    }
  }
}

setInterval(() => {
  tick().catch((e) => console.error(JSON.stringify({ msg: 'worker tick failed', error: String(e).slice(0, 200) })));
}, 2_000);
console.log(JSON.stringify({ msg: 'worker started', adapter: env.SHOPIFY_ADAPTER }));
