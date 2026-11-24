import { PrismaClient } from '@prisma/client';
import { effectivePermissions } from '@orderflow/shared';
import { loadEnv } from './config/env.js';
import { PrismaAudit, PrismaInboxRepo, PrismaOrderRepo } from './db/prismaRepos.js';
import { createApp } from './http/app.js';
import { InvalidSignatureThrottle } from './modules/webhooks-inbox/receiver.js';

const env = loadEnv();
const db = new PrismaClient();
const orders = new PrismaOrderRepo(db);

const app = createApp({
  receiver: {
    secret: env.SHOPIFY_APP_SECRET,
    shopDomain: env.SHOPIFY_SHOP_DOMAIN,
    inbox: new PrismaInboxRepo(db),
    audit: new PrismaAudit(db),
    throttle: new InvalidSignatureThrottle(),
  },
  // TODO(S0): replace with OIDC token and session validation. Until then every protected route is 401.
  authenticate: async () => null,
  listRows: () => orders.listRows(env.STALE_AFTER_MINUTES, new Date()),
  databaseHealthy: async () => {
    await db.$queryRaw`SELECT 1`;
    return true;
  },
});

void effectivePermissions; // used by the S0 authenticate implementation
app.listen(env.PORT, () => console.log(JSON.stringify({ msg: 'api listening', port: env.PORT, adapter: env.SHOPIFY_ADAPTER })));
