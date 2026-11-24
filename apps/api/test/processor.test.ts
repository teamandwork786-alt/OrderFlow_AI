import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fixtureOrder, baseOrder, type FixtureName } from '../src/integrations/shopify/mock/fixtures.js';
import { InMemoryMockStore, MockShopifyAdapter } from '../src/integrations/shopify/mock/mockAdapter.js';
import { runWorkerTick, type ProcessorDeps } from '../src/modules/webhooks-inbox/processor.js';
import { nextRetryDelayMs, isDeadLetter, RETRY_BASE_MS } from '../src/modules/webhooks-inbox/retry.js';
import { MemoryAudit, MemoryInbox, MemoryOrders } from './support/memory.js';

function setup() {
  const store = new InMemoryMockStore();
  const inbox = new MemoryInbox();
  const orders = new MemoryOrders();
  let nowMs = Date.parse('2026-11-21T00:00:00.000Z');
  const deps: ProcessorDeps = {
    adapter: new MockShopifyAdapter(store),
    orders,
    inbox,
    audit: new MemoryAudit(),
    now: () => new Date(nowMs),
    random: () => 0,
  };
  const deliver = (id: string, webhookId: string, topic = 'orders/paid') =>
    inbox.insertIfAbsent({
      shopifyWebhookId: webhookId,
      shopifyEventId: null,
      topic,
      shopDomain: 's',
      apiVersion: null,
      shopifyTriggeredAt: null,
      resourceId: id,
      payload: { id },
    });
  return {
    store,
    inbox,
    orders,
    deps,
    deliver,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe('worker processing (PRD scenarios 1, 2, 4, 5, 6)', () => {
  it('M1: a paid order becomes PAID and is stored once', async () => {
    const s = setup();
    await s.store.putOrder(fixtureOrder('paid', '1001'));
    await s.deliver('1001', 'w1');
    assert.deepEqual(await runWorkerTick(s.deps), ['PROCESSED']);
    const row = s.orders.rows.get('1001')!;
    assert.equal(row.lifecycleStatus, 'PAID');
    assert.equal(row.evaluation.status, 'ELIGIBLE');
    assert.equal(row.paymentVerifiedAt, '2026-11-20T10:00:00.000Z');
    assert.equal(s.inbox.all[0]!.status, 'PROCESSED');
  });

  const blocked: [FixtureName, string, string][] = [
    ['unpaid', 'PENDING_PAYMENT', 'NOT_PAID'],
    ['test_payment', 'PENDING_PAYMENT', 'TEST_TRANSACTION'],
    ['refunded', 'PENDING_PAYMENT', 'REFUNDED_OR_VOIDED'],
    ['wrong_currency', 'PENDING_PAYMENT', 'CURRENCY_MISMATCH'],
    ['amount_mismatch', 'PENDING_PAYMENT', 'AMOUNT_MISMATCH'],
    ['cancelled', 'CANCELLED', 'CANCELLED'],
  ];
  for (const [fixture, lifecycle, reason] of blocked) {
    it(`M2: ${fixture} is stored as ${lifecycle} and ineligible (${reason}), never PAID`, async () => {
      const s = setup();
      await s.store.putOrder(fixtureOrder(fixture, '2001'));
      await s.deliver('2001', 'w1');
      await runWorkerTick(s.deps);
      const row = s.orders.rows.get('2001')!;
      assert.equal(row.lifecycleStatus, lifecycle);
      assert.deepEqual(row.evaluation, { status: 'INELIGIBLE', reasonCode: reason });
      assert.equal(row.paymentVerifiedAt, null);
    });
  }

  it('M4: the same order delivered twice has no second business effect', async () => {
    const s = setup();
    await s.store.putOrder(fixtureOrder('paid', '1001'));
    await s.deliver('1001', 'w1');
    await s.deliver('1001', 'w1'); // duplicate delivery ID: ignored by the inbox
    await runWorkerTick(s.deps);
    assert.equal(s.inbox.all.length, 1);
    assert.equal(s.orders.rows.size, 1);
    // A second webhook with a new ID for the unchanged order re-evaluates idempotently.
    await s.deliver('1001', 'w2');
    await runWorkerTick(s.deps);
    const row = s.orders.rows.get('1001')!;
    assert.equal(row.lifecycleStatus, 'PAID');
    assert.equal(row.orderVersion, 1, 'a refresh with no lifecycle change does not bump the version');
  });

  it('M6: an older Shopify update cannot overwrite newer synchronized data', async () => {
    const s = setup();
    await s.store.putOrder(
      baseOrder('3001', { customer: { name: 'Newer Name', email: null, phone: null }, updatedAt: '2026-11-20T12:00:00.000Z' }),
    );
    await s.deliver('3001', 'w1');
    await runWorkerTick(s.deps);
    // Shopify now returns an older snapshot (a delayed webhook racing the current state).
    await s.store.putOrder(
      baseOrder('3001', { customer: { name: 'Older Name', email: null, phone: null }, updatedAt: '2026-11-20T09:00:00.000Z' }),
    );
    await s.deliver('3001', 'w2');
    assert.deepEqual(await runWorkerTick(s.deps), ['IGNORED_OLDER']);
    assert.equal(s.orders.rows.get('3001')!.order.customer.name, 'Newer Name');
    assert.equal(s.inbox.all[1]!.status, 'PROCESSED');
  });

  it('an unpaid order that later becomes paid moves to PAID exactly once and bumps the version', async () => {
    const s = setup();
    await s.store.putOrder(fixtureOrder('unpaid', '4001'));
    await s.deliver('4001', 'w1');
    await runWorkerTick(s.deps);
    assert.equal(s.orders.rows.get('4001')!.lifecycleStatus, 'PENDING_PAYMENT');
    await s.store.putOrder(baseOrder('4001', { updatedAt: '2026-11-20T11:00:00.000Z' }));
    await s.deliver('4001', 'w2');
    await runWorkerTick(s.deps);
    const row = s.orders.rows.get('4001')!;
    assert.equal(row.lifecycleStatus, 'PAID');
    assert.equal(row.orderVersion, 2);
    await s.deliver('4001', 'w3');
    await runWorkerTick(s.deps);
    assert.equal(s.orders.rows.get('4001')!.orderVersion, 2, 'no further bump');
  });

  it('a PAID order that Shopify later refunds stays PAID but becomes ineligible (no regression)', async () => {
    const s = setup();
    await s.store.putOrder(fixtureOrder('paid', '5001'));
    await s.deliver('5001', 'w1');
    await runWorkerTick(s.deps);
    await s.store.putOrder(
      baseOrder('5001', { financialStatus: 'REFUNDED', refunds: [{ id: 'r' }], updatedAt: '2026-11-20T13:00:00.000Z' }),
    );
    await s.deliver('5001', 'w2');
    await runWorkerTick(s.deps);
    const row = s.orders.rows.get('5001')!;
    assert.equal(row.lifecycleStatus, 'PAID');
    assert.deepEqual(row.evaluation, { status: 'INELIGIBLE', reasonCode: 'REFUNDED_OR_VOIDED' });
  });

  it('a pre-dispatch Shopify cancellation moves PAID to CANCELLED', async () => {
    const s = setup();
    await s.store.putOrder(fixtureOrder('paid', '6001'));
    await s.deliver('6001', 'w1');
    await runWorkerTick(s.deps);
    await s.store.putOrder(baseOrder('6001', { cancelledAt: '2026-11-20T14:00:00.000Z', updatedAt: '2026-11-20T14:00:00.000Z' }));
    await s.deliver('6001', 'w2');
    await runWorkerTick(s.deps);
    assert.equal(s.orders.rows.get('6001')!.lifecycleStatus, 'CANCELLED');
  });

  it('a webhook for an order Shopify does not know goes straight to DEAD_LETTER (permanent)', async () => {
    const s = setup();
    await s.deliver('9999', 'w1');
    assert.deepEqual(await runWorkerTick(s.deps), ['DEAD_LETTER']);
    assert.equal(s.inbox.all[0]!.lastErrorCode, 'ORDER_NOT_FOUND');
    assert.equal(s.orders.rows.size, 0);
  });

  it('a webhook with no resolvable order ID goes to DEAD_LETTER', async () => {
    const s = setup();
    await s.inbox.insertIfAbsent({
      shopifyWebhookId: 'w9',
      shopifyEventId: null,
      topic: 'orders/paid',
      shopDomain: 's',
      apiVersion: null,
      shopifyTriggeredAt: null,
      resourceId: null,
      payload: {},
    });
    assert.deepEqual(await runWorkerTick(s.deps), ['DEAD_LETTER']);
  });

  it('M5: a Shopify outage is retried with backoff, never produces a permanent business outcome', async () => {
    const s = setup();
    await s.store.putOrder(fixtureOrder('paid', '7001'));
    await s.store.setScenario('outage', true);
    await s.deliver('7001', 'w1');
    assert.deepEqual(await runWorkerTick(s.deps), ['FAILED_RETRY']);
    const item = s.inbox.all[0]!;
    assert.equal(item.status, 'FAILED');
    assert.equal(item.attemptCount, 1);
    assert.equal(s.orders.rows.size, 0, 'an outage must not store an order or mark it ineligible');
    // Not due yet: nothing is claimed.
    assert.deepEqual(await runWorkerTick(s.deps), []);
    // Outage ends: the retry succeeds.
    await s.store.setScenario('outage', false);
    s.advance(RETRY_BASE_MS[0] * 1.3);
    assert.deepEqual(await runWorkerTick(s.deps), ['PROCESSED']);
    assert.equal(s.orders.rows.get('7001')!.lifecycleStatus, 'PAID');
  });

  it('M5: repeated failures reach DEAD_LETTER on the 8th attempt, and the item is then never claimed again', async () => {
    const s = setup();
    await s.store.putOrder(fixtureOrder('paid', '8001'));
    await s.store.setScenario('outage', true);
    await s.deliver('8001', 'w1');
    const outcomes: string[] = [];
    for (let i = 0; i < 10; i++) {
      outcomes.push(...(await runWorkerTick(s.deps)));
      s.advance(2 * 3_600_000); // always past the next retry
    }
    assert.equal(outcomes.filter((o) => o === 'FAILED_RETRY').length, 7);
    assert.equal(outcomes.filter((o) => o === 'DEAD_LETTER').length, 1);
    assert.equal(s.inbox.all[0]!.status, 'DEAD_LETTER');
    assert.equal(s.inbox.all[0]!.attemptCount, 8);
  });

  it('a crashed worker: an item stuck in PROCESSING is claimable again after its lease expires', async () => {
    const s = setup();
    await s.store.putOrder(fixtureOrder('paid', '1002'));
    await s.deliver('1002', 'w1');
    const first = await s.inbox.claimDue(s.deps.now(), 10, 120_000); // claimed, then the worker "crashes"
    assert.equal(first.length, 1);
    assert.deepEqual(await s.inbox.claimDue(s.deps.now(), 10, 120_000), []); // lease still held
    s.advance(121_000);
    assert.deepEqual(await runWorkerTick(s.deps), ['PROCESSED']);
  });
});

describe('retry schedule (boundaries)', () => {
  it('uses 1 min, 5 min, 15 min, 1 h, 1 h and stays at 1 h', () => {
    const base = [1, 2, 3, 4, 5, 6, 7].map((n) => nextRetryDelayMs(n, () => 0));
    assert.deepEqual(base, [60_000, 300_000, 900_000, 3_600_000, 3_600_000, 3_600_000, 3_600_000]);
  });
  it('adds at most 20% jitter', () => {
    assert.equal(
      nextRetryDelayMs(1, () => 0.999999),
      72_000,
    );
    assert.ok(nextRetryDelayMs(2, () => 0.5) === 330_000);
  });
  it('rejects a non-positive attempt count', () => {
    assert.throws(() => nextRetryDelayMs(0), RangeError);
  });
  it('dead-letters at 8 failed attempts, not 7', () => {
    assert.equal(isDeadLetter(7), false);
    assert.equal(isDeadLetter(8), true);
    assert.equal(isDeadLetter(9), true);
  });
});
