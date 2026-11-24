import {
  ShopifyPermanentError,
  ShopifyTransientError,
  type DomainFulfillment,
  type DomainShopifyOrder,
} from '../../../modules/sync/types.js';
import type { FulfillmentResult, Page, ShopifyAdapter } from '../adapter.js';

export type MockScenario = 'outage' | 'create_timeout' | 'create_reject';

/**
 * State of the simulated Shopify. The production implementation is backed by the database tables
 * mock_shopify_orders and mock_controls, because the API and the worker are separate processes.
 * The in-memory implementation below is for tests only.
 */
export interface MockStore {
  getOrder(id: string): Promise<DomainShopifyOrder | undefined>;
  putOrder(order: DomainShopifyOrder): Promise<void>;
  listOrders(): Promise<DomainShopifyOrder[]>;
  isOn(scenario: MockScenario): Promise<boolean>;
  setScenario(scenario: MockScenario, on: boolean): Promise<void>;
}

export class InMemoryMockStore implements MockStore {
  private orders = new Map<string, DomainShopifyOrder>();
  private on = new Set<MockScenario>();
  async getOrder(id: string) {
    const o = this.orders.get(id);
    return o ? structuredClone(o) : undefined;
  }
  async putOrder(order: DomainShopifyOrder) {
    this.orders.set(order.shopifyOrderId, structuredClone(order));
  }
  async listOrders() {
    return [...this.orders.values()].map((o) => structuredClone(o));
  }
  async isOn(s: MockScenario) {
    return this.on.has(s);
  }
  async setScenario(s: MockScenario, value: boolean) {
    if (value) this.on.add(s);
    else this.on.delete(s);
  }
}

export class MockShopifyAdapter implements ShopifyAdapter {
  private counter = 0;
  constructor(
    private store: MockStore,
    private now: () => Date = () => new Date(),
  ) {}

  private async guardOutage(): Promise<void> {
    if (await this.store.isOn('outage')) throw new ShopifyTransientError('SHOPIFY_UNAVAILABLE', 'mock outage');
  }

  async getOrder(shopifyOrderId: string): Promise<DomainShopifyOrder> {
    await this.guardOutage();
    const order = await this.store.getOrder(shopifyOrderId);
    if (!order) throw new ShopifyPermanentError('ORDER_NOT_FOUND', 'order not found');
    return order;
  }

  async listFulfillments(shopifyOrderId: string): Promise<DomainFulfillment[]> {
    return (await this.getOrder(shopifyOrderId)).fulfillments;
  }

  async listOrdersUpdatedSince(since: Date): Promise<Page<string>> {
    await this.guardOutage();
    const all = await this.store.listOrders();
    return { items: all.filter((o) => Date.parse(o.updatedAt) >= since.getTime()).map((o) => o.shopifyOrderId) };
  }

  /** Dispatch behaviour is verified in slice S3; the scenario switches are implemented now so S3 can use them. */
  async createFulfillment(input: {
    shopifyOrderId: string;
    trackingNumber: string;
    notifyCustomer: boolean;
    requestId: string;
  }): Promise<FulfillmentResult> {
    await this.guardOutage();
    if (await this.store.isOn('create_reject')) return { outcome: 'REJECTED', reason: 'MOCK_REJECTED' };
    const order = await this.getOrder(input.shopifyOrderId);
    const id = `mock-fulfillment-${++this.counter}`;
    order.fulfillments.push({ id, status: 'SUCCESS', trackingNumber: input.trackingNumber });
    order.updatedAt = this.now().toISOString();
    await this.store.putOrder(order);
    // Timeout scenario: the fulfillment IS created, but the caller gets no answer, so reconciliation is genuinely exercised.
    if (await this.store.isOn('create_timeout')) return { outcome: 'UNKNOWN' };
    return { outcome: 'CONFIRMED', fulfillmentId: id };
  }

  async ping(): Promise<void> {
    await this.guardOutage();
  }
}
