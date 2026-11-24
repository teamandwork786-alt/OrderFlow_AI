import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { buildSignedWebhook, fixtureOrder, FIXTURE_NAMES } from '../src/integrations/shopify/mock/fixtures.js';
import { InMemoryMockStore, MockShopifyAdapter } from '../src/integrations/shopify/mock/mockAdapter.js';
import { runWorkerTick } from '../src/modules/webhooks-inbox/processor.js';
import { handleWebhook, InvalidSignatureThrottle } from '../src/modules/webhooks-inbox/receiver.js';
import { MemoryAudit, MemoryInbox, MemoryOrders } from './support/memory.js';

describe('mock Shopify adapter', () => {
  it('has a fixture for every named scenario and never real customer data', () => {
    for (const name of FIXTURE_NAMES) {
      const o = fixtureOrder(name, '1');
      assert.ok(o.customer.email?.endsWith('@example.com'));
    }
  });
  it('outage makes calls fail transiently; unknown order fails permanently', async () => {
    const store = new InMemoryMockStore();
    const a = new MockShopifyAdapter(store);
    await assert.rejects(a.getOrder('nope'), { code: 'ORDER_NOT_FOUND' });
    await store.putOrder(fixtureOrder('paid', '1'));
    await store.setScenario('outage', true);
    await assert.rejects(a.getOrder('1'), { code: 'SHOPIFY_UNAVAILABLE' });
    await assert.rejects(a.ping(), { code: 'SHOPIFY_UNAVAILABLE' });
  });
  it('timeout scenario records the fulfillment as created but returns UNKNOWN (used by slice S3)', async () => {
    const store = new InMemoryMockStore();
    const a = new MockShopifyAdapter(store);
    await store.putOrder(fixtureOrder('paid', '1'));
    await store.setScenario('create_timeout', true);
    const r = await a.createFulfillment({ shopifyOrderId: '1', trackingNumber: 'TRK-123456', notifyCustomer: false, requestId: 'r' });
    assert.deepEqual(r, { outcome: 'UNKNOWN' });
    assert.equal((await a.listFulfillments('1')).length, 1);
  });
  it('the adapter interface exposes no refund, return or payment operation', () => {
    const names = Object.getOwnPropertyNames(MockShopifyAdapter.prototype);
    assert.ok(!names.some((n) => /refund|return|payment|edit/i.test(n)), names.join(','));
  });
});

describe('end to end over real HTTP (receiver, inbox, worker, mock Shopify)', () => {
  const SECRET = 'demo-secret';
  const SHOP = 'demo-shop.myshopify.com';

  function startServer() {
    const inbox = new MemoryInbox();
    const deps = { secret: SECRET, shopDomain: SHOP, inbox, audit: new MemoryAudit(), throttle: new InvalidSignatureThrottle() };
    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', async () => {
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v[0] : v;
        const out = await handleWebhook({ rawBody: Buffer.concat(chunks), headers, sourceKey: req.socket.remoteAddress ?? '' }, deps);
        res.statusCode = out.status;
        res.end(out.outcome);
      });
    });
    return new Promise<{ url: string; inbox: MemoryInbox; close: () => void }>((resolve) =>
      server.listen(0, '127.0.0.1', () =>
        resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, inbox, close: () => server.close() }),
      ),
    );
  }

  it('a signed fixture webhook is accepted over HTTP and processed into one eligible PAID order', async () => {
    const { url, inbox, close } = await startServer();
    try {
      const w = buildSignedWebhook({ topic: 'orders/paid', shopifyOrderId: '1001', secret: SECRET, shopDomain: SHOP, webhookId: 'http-1' });
      const send = () => fetch(`${url}/webhooks/shopify`, { method: 'POST', headers: w.headers, body: w.body });
      assert.equal((await send()).status, 200);
      assert.equal((await send()).status, 200); // replay of the same delivery
      assert.equal(inbox.all.length, 1);

      const tampered = await fetch(url, { method: 'POST', headers: w.headers, body: w.body.replace('1001', '1002') });
      assert.equal(tampered.status, 401);
      assert.equal(inbox.all.length, 1);

      const store = new InMemoryMockStore();
      await store.putOrder(fixtureOrder('paid', '1001'));
      const orders = new MemoryOrders();
      const outcomes = await runWorkerTick({
        adapter: new MockShopifyAdapter(store),
        orders,
        inbox,
        audit: new MemoryAudit(),
        now: () => new Date(),
      });
      assert.deepEqual(outcomes, ['PROCESSED']);
      assert.equal(orders.rows.get('1001')!.lifecycleStatus, 'PAID');
    } finally {
      close();
    }
  });
});
