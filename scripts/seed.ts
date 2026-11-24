/** Destructive: resets, then loads synthetic demo users and the fixture orders into the mock Shopify. */
import { PrismaClient } from '@prisma/client';
import { fixtureOrder, FIXTURE_NAMES } from '../apps/api/src/integrations/shopify/mock/fixtures.js';
import { assertDestructiveAllowed } from './guard.js';

assertDestructiveAllowed('seed demo data');
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL });

// Demo identities. The subjects must match the users of the mock OIDC issuer (created in slice S0).
const USERS: [subject: string, name: string, roles: string[]][] = [
  [process.env.BOOTSTRAP_OWNER_SUBJECT ?? 'demo-owner', 'Demo Owner', ['owner']],
  ['demo-admin', 'Demo Admin', ['admin']],
  ['demo-staff', 'Demo Staff', ['staff']],
  ['demo-dispatcher', 'Demo Dispatcher', ['staff', 'cap_dispatch']],
  ['demo-delivery', 'Demo Delivery', ['staff', 'cap_delivery']],
];

for (const [subject, displayName, roleKeys] of USERS) {
  const user = await db.user.upsert({
    where: { oidcSubject: subject },
    update: { displayName },
    create: { oidcSubject: subject, displayName, email: `${subject}@example.com` },
  });
  for (const key of roleKeys) {
    const role = await db.role.findUniqueOrThrow({ where: { key } });
    await db.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
}
for (const name of FIXTURE_NAMES) {
  const order = fixtureOrder(name, `fx-${name}`);
  await db.mockShopifyOrder.upsert({
    where: { shopifyOrderId: order.shopifyOrderId },
    update: { data: order as never },
    create: { shopifyOrderId: order.shopifyOrderId, data: order as never },
  });
}
await db.$disconnect();
console.log(`Seeded ${USERS.length} demo users and ${FIXTURE_NAMES.length} fixture orders (ids fx-<fixture>).`);
