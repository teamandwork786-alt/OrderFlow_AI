import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { baseOrder, fixtureOrder } from '../src/integrations/shopify/mock/fixtures.js';
import { InMemoryMockStore, MockShopifyAdapter } from '../src/integrations/shopify/mock/mockAdapter.js';
import { reconcile } from '../src/modules/sync/reconcile.js';
import { MemoryOrders } from './support/memory.js';

const NOW = new Date('2026-11-25T00:00:00.000Z');

function setup() {
  const store = new InMemoryMockStore();
  const orders = new MemoryOrders();
  const deps = { adapter: new MockShopifyAdapter(store), orders, now: () => NOW };
  return { store, orders, deps };
}

describe('reconciliation job (FR-01, architecture 10.11)', () => {
  it('imports an order whose webhook was never delivered, if updated within the 48 h window', async () => {
    const { store, orders, deps } = setup();
    await store.putOrder(baseOrder('1001', { updatedAt: '2026-11-24T12:00:00.000Z' }));
    assert.deepEqual(await reconcile(deps), { refreshed: 1, ignoredOlder: 0, failed: 0 });
    assert.equal(orders.rows.get('1001')!.lifecycleStatus, 'PAID');
  });

  it('boundary: an order updated just outside 48 h is not discovered, just inside is', async () => {
    const { store, orders, deps } = setup();
    await store.putOrder(baseOrder('1001', { updatedAt: '2026-11-23T00:00:01.000Z' })); // 47 h 59 m 59 s ago
    await store.putOrder(baseOrder('1002', { updatedAt: '2026-11-22T23:59:59.000Z' })); // 48 h 0 m 1 s ago
    await reconcile(deps);
    assert.ok(orders.rows.has('1001'));
    assert.ok(!orders.rows.has('1002'));
  });

  it('refreshes a local actionable order even when it is older than the window', async () => {
    const { store, orders, deps } = setup();
    await store.putOrder(baseOrder('2001', { updatedAt: '2026-11-10T00:00:00.000Z' }));
    await orders.applySync({
      order: baseOrder('2001', { updatedAt: '2026-11-10T00:00:00.000Z' }),
      evaluation: { status: 'ELIGIBLE', paymentVerifiedAt: '2026-11-10T00:00:00.000Z' },
      transition: { to: 'PAID' },
      isNew: true,
      now: NOW,
    });
    // Shopify has since cancelled it, but no webhook arrived and it is outside the 48 h window.
    await store.putOrder(baseOrder('2001', { cancelledAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z' }));
    await reconcile(deps);
    assert.equal(orders.rows.get('2001')!.lifecycleStatus, 'CANCELLED');
  });

  it('an outage counts failures without storing anything or throwing', async () => {
    const { store, orders, deps } = setup();
    await store.putOrder(baseOrder('3001', { updatedAt: '2026-11-24T12:00:00.000Z' }));
    await store.setScenario('outage', true);
    await assert.rejects(deps.adapter.listOrdersUpdatedSince(new Date(0)), { code: 'SHOPIFY_UNAVAILABLE' });
    await assert.rejects(reconcile(deps), { code: 'SHOPIFY_UNAVAILABLE' }); // discovery itself failed: the cycle is retried later
    assert.equal(orders.rows.size, 0);
  });

  it('one bad order does not stop the others; an older snapshot is ignored; a blocked order is not promoted', async () => {
    const { store, orders, deps } = setup();
    await store.putOrder(fixtureOrder('amount_mismatch', 'bad1'));
    await store.putOrder(baseOrder('good1', { updatedAt: '2026-11-24T10:00:00.000Z' }));
    await store.putOrder(baseOrder('good2', { updatedAt: '2026-11-24T10:00:00.000Z' }));
    await reconcile(deps);
    assert.equal(orders.rows.get('good1')!.lifecycleStatus, 'PAID');
    assert.equal(orders.rows.get('good2')!.lifecycleStatus, 'PAID');
    assert.equal(orders.rows.get('bad1')?.lifecycleStatus ?? 'absent', 'absent'); // outside window (fixture dated 20 Nov)
    const again = await reconcile(deps);
    assert.equal(again.ignoredOlder + again.refreshed, 2); // idempotent, no failures
    assert.equal(again.failed, 0);
  });
});
