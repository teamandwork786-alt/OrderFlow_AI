import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signShopifyBody, verifyShopifyHmac } from '../src/lib/hmac.js';
import { buildSignedWebhook } from '../src/integrations/shopify/mock/fixtures.js';
import { handleWebhook, InvalidSignatureThrottle, resolveResourceId, type ReceiverDeps } from '../src/modules/webhooks-inbox/receiver.js';
import { MemoryAudit, MemoryInbox } from './support/memory.js';

const SECRET = 'demo-secret';
const SHOP = 'demo-shop.myshopify.com';

function setup() {
  const inbox = new MemoryInbox();
  const audit = new MemoryAudit();
  let t = 0;
  const throttle = new InvalidSignatureThrottle(60_000, () => t);
  const deps: ReceiverDeps = { secret: SECRET, shopDomain: SHOP, inbox, audit, throttle };
  const send = (w: { body: string; headers: Record<string, string> }, source = 'ip1') =>
    handleWebhook({ rawBody: Buffer.from(w.body), headers: w.headers, sourceKey: source }, deps);
  return {
    inbox,
    audit,
    send,
    advance: (ms: number) => {
      t += ms;
    },
  };
}
const signed = (over: Partial<Parameters<typeof buildSignedWebhook>[0]> = {}) =>
  buildSignedWebhook({ topic: 'orders/paid', shopifyOrderId: '1001', secret: SECRET, shopDomain: SHOP, webhookId: 'wh-1', ...over });

describe('HMAC verification', () => {
  const body = Buffer.from('{"id":1}');
  it('accepts the right signature', () => assert.equal(verifyShopifyHmac(body, signShopifyBody(body, SECRET), SECRET), true));
  it('rejects a wrong secret', () => assert.equal(verifyShopifyHmac(body, signShopifyBody(body, 'other'), SECRET), false));
  it('rejects a tampered body', () =>
    assert.equal(verifyShopifyHmac(Buffer.from('{"id":2}'), signShopifyBody(body, SECRET), SECRET), false));
  it('rejects missing, empty and wrong-length headers without throwing', () => {
    assert.equal(verifyShopifyHmac(body, undefined, SECRET), false);
    assert.equal(verifyShopifyHmac(body, '', SECRET), false);
    assert.equal(verifyShopifyHmac(body, 'short', SECRET), false);
  });
  it('the signature covers raw bytes: re-serialized JSON with different spacing fails', () => {
    const sig = signShopifyBody('{"id":1}', SECRET);
    assert.equal(verifyShopifyHmac(Buffer.from('{ "id": 1 }'), sig, SECRET), false);
  });
});

describe('webhook receiver (PRD scenarios 3 and 4)', () => {
  it('stores a valid webhook and answers 200', async () => {
    const { send, inbox } = setup();
    const r = await send(signed());
    assert.deepEqual(r, { status: 200, outcome: 'STORED' });
    assert.equal(inbox.all.length, 1);
    assert.equal(inbox.all[0]!.resourceId, '1001');
    assert.equal(inbox.all[0]!.status, 'RECEIVED');
  });

  it('M3: an invalid signature is rejected with 401, nothing is stored, audit has no payload', async () => {
    const { send, inbox, audit } = setup();
    const w = signed();
    w.headers['x-shopify-hmac-sha256'] = signShopifyBody(w.body, 'attacker');
    const r = await send(w);
    assert.deepEqual(r, { status: 401, outcome: 'INVALID_SIGNATURE' });
    assert.equal(inbox.all.length, 0);
    assert.equal(audit.events.length, 1);
    assert.equal(audit.events[0]!.eventType, 'WEBHOOK_SIGNATURE_INVALID');
    assert.ok(!JSON.stringify(audit.events[0]).includes('1001'), 'no payload content in audit');
  });

  it('M3: a missing signature header is rejected', async () => {
    const { send } = setup();
    const w = signed();
    delete w.headers['x-shopify-hmac-sha256'];
    assert.equal((await send(w)).status, 401);
  });

  it('invalid-signature audit events are throttled per source, with a suppressed count', async () => {
    const { send, audit, advance } = setup();
    const bad = () => {
      const w = signed();
      w.headers['x-shopify-hmac-sha256'] = 'bad';
      return w;
    };
    for (let i = 0; i < 5; i++) await send(bad());
    assert.equal(audit.events.length, 1);
    advance(61_000);
    await send(bad());
    assert.equal(audit.events.length, 2);
    assert.equal(audit.events[1]!.details.suppressed_since_last, 4);
    await send(bad(), 'ip2'); // a different source is throttled separately
    assert.equal(audit.events.length, 3);
  });

  it('M4: the same delivery ID twice stores one row and still answers 200', async () => {
    const { send, inbox } = setup();
    assert.equal((await send(signed())).outcome, 'STORED');
    const again = await send(signed());
    assert.deepEqual(again, { status: 200, outcome: 'DUPLICATE' });
    assert.equal(inbox.all.length, 1);
  });

  it('a duplicate is acknowledged 200 even when the stored item already failed or is dead-lettered', async () => {
    const { send, inbox } = setup();
    await send(signed());
    inbox.all[0]!.status = 'DEAD_LETTER';
    assert.equal((await send(signed())).status, 200);
  });

  it('rejects a different shop domain with 400 and stores nothing', async () => {
    const { send, inbox } = setup();
    const w = signed();
    w.headers['x-shopify-shop-domain'] = 'evil.myshopify.com';
    assert.deepEqual(await send(w), { status: 400, outcome: 'WRONG_SHOP' });
    assert.equal(inbox.all.length, 0);
  });

  it('rejects an unsubscribed topic', async () => {
    const { send } = setup();
    assert.deepEqual(await send(signed({ topic: 'customers/create' })), { status: 400, outcome: 'TOPIC_NOT_SUBSCRIBED' });
  });

  it('rejects a missing delivery ID and a non-JSON body', async () => {
    const { send } = setup();
    const noId = signed();
    delete noId.headers['x-shopify-webhook-id'];
    assert.equal((await send(noId)).outcome, 'MALFORMED');
    const raw = '{not json';
    const bad = signed();
    bad.body = raw;
    bad.headers['x-shopify-hmac-sha256'] = signShopifyBody(raw, SECRET);
    assert.equal((await send(bad)).outcome, 'MALFORMED');
  });

  it('answers 500 when storing fails, so Shopify redelivers', async () => {
    const { send, inbox } = setup();
    inbox.insertIfAbsent = async () => {
      throw new Error('db down');
    };
    assert.deepEqual(await send(signed()), { status: 500, outcome: 'STORE_FAILED' });
  });

  it('resolves the order ID by topic', () => {
    assert.equal(resolveResourceId('orders/paid', { id: 123 }), '123');
    assert.equal(resolveResourceId('fulfillments/create', { order_id: 456 }), '456');
    assert.equal(resolveResourceId('refunds/create', { order_id: '789' }), '789');
    assert.equal(resolveResourceId('orders/paid', {}), null);
    assert.equal(resolveResourceId('orders/paid', null), null);
  });
});
