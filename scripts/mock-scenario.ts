/** Flip a mock Shopify scenario for BOTH the API and the worker:  npm run mock:scenario -- --set outage=on */
import { PrismaClient } from '@prisma/client';

const SCENARIOS = ['outage', 'create_timeout', 'create_reject'];
const i = process.argv.indexOf('--set');
const [name, value] = (process.argv[i + 1] ?? '').split('=');
if (i < 0 || !name || !SCENARIOS.includes(name) || !['on', 'off'].includes(value ?? '')) {
  console.error(`Usage: npm run mock:scenario -- --set <${SCENARIOS.join('|')}>=<on|off>`);
  process.exit(2);
}
if ((process.env.SHOPIFY_ADAPTER ?? 'mock') === 'real') {
  console.error('Scenarios apply to mock mode only.');
  process.exit(1);
}
const db = new PrismaClient();
await db.mockControl.upsert({ where: { key: name }, update: { value: value! }, create: { key: name, value: value! } });
await db.$disconnect();
console.log(`mock scenario ${name} = ${value}`);
