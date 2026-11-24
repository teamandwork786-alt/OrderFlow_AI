/** Destructive: empties all operational tables (keeps roles and permissions). Uses the OWNER connection (TRUNCATE). */
import { PrismaClient } from '@prisma/client';
import { assertDestructiveAllowed } from './guard.js';

assertDestructiveAllowed('reset demo data');
const url = process.env.DATABASE_URL_OWNER;
if (!url) {
  console.error('DATABASE_URL_OWNER is required (the app role cannot TRUNCATE by design).');
  process.exit(1);
}

const TABLES = [
  'order_notes',
  'audit_events',
  'refund_application_items',
  'refund_applications',
  'dispatches',
  'checklist_steps',
  'order_items',
  'webhook_inbox',
  'orders',
  'user_roles',
  'users',
  'integration_state',
  'worker_heartbeats',
  'mock_shopify_orders',
  'mock_controls',
];
console.log(`About to TRUNCATE: ${TABLES.join(', ')}`);
const db = new PrismaClient({ datasourceUrl: url });
await db.$executeRawUnsafe(`TRUNCATE ${TABLES.join(', ')} CASCADE`);
await db.$disconnect();
console.log('Demo data reset. Run `npm run db:seed` to load demo data again.');
