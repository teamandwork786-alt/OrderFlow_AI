// Database-backed simulated Shopify state, shared by the API, the worker and `npm run mock:scenario`.
// NOT compiled in the authoring sandbox (Prisma could not be installed there).
import type { Prisma, PrismaClient } from '@prisma/client';
import type { MockScenario, MockStore } from '../integrations/shopify/mock/mockAdapter.js';
import type { DomainShopifyOrder } from '../modules/sync/types.js';

export class PrismaMockStore implements MockStore {
  constructor(private db: PrismaClient) {}

  async getOrder(id: string) {
    const row = await this.db.mockShopifyOrder.findUnique({ where: { shopifyOrderId: id } });
    return row ? (row.data as unknown as DomainShopifyOrder) : undefined;
  }
  async putOrder(order: DomainShopifyOrder) {
    const data = order as unknown as Prisma.InputJsonValue;
    await this.db.mockShopifyOrder.upsert({
      where: { shopifyOrderId: order.shopifyOrderId },
      update: { data },
      create: { shopifyOrderId: order.shopifyOrderId, data },
    });
  }
  async listOrders() {
    return (await this.db.mockShopifyOrder.findMany()).map((r) => r.data as unknown as DomainShopifyOrder);
  }
  async isOn(scenario: MockScenario) {
    return (await this.db.mockControl.findUnique({ where: { key: scenario } }))?.value === 'on';
  }
  async setScenario(scenario: MockScenario, on: boolean) {
    await this.db.mockControl.upsert({
      where: { key: scenario },
      update: { value: on ? 'on' : 'off' },
      create: { key: scenario, value: on ? 'on' : 'off' },
    });
  }
}
