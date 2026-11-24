/**
 * Send a signed fixture webhook to the API (mock mode).
 *   npm run webhook:simulate -- --topic orders/paid --fixture paid
 * Fixture orders are loaded into the mock Shopify by `npm run db:seed` under the id "fx-<fixture>".
 * Options: --url (default http://localhost:3000/webhooks/shopify) --order-id --webhook-id --dry-run
 */
import { randomUUID } from 'node:crypto';
import { buildSignedWebhook, FIXTURE_NAMES } from '../apps/api/src/integrations/shopify/mock/fixtures.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const topic = arg('topic') ?? 'orders/paid';
const fixture = arg('fixture') ?? 'paid';
if (!(FIXTURE_NAMES as string[]).includes(fixture)) {
  console.error(`Unknown fixture "${fixture}". Choose one of: ${FIXTURE_NAMES.join(', ')}`);
  process.exit(2);
}
const secret = process.env.SHOPIFY_APP_SECRET ?? 'demo-shopify-app-secret';
const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN ?? 'demo-shop.myshopify.com';
const url = arg('url') ?? process.env.WEBHOOK_URL ?? 'http://localhost:3000/webhooks/shopify';
const signed = buildSignedWebhook({
  topic,
  secret,
  shopDomain,
  shopifyOrderId: arg('order-id') ?? `fx-${fixture}`,
  webhookId: arg('webhook-id') ?? randomUUID(),
});

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ url, headers: signed.headers, body: signed.body }, null, 2));
} else {
  const res = await fetch(url, { method: 'POST', headers: signed.headers, body: signed.body });
  console.log(`${res.status} ${await res.text()}`);
}
