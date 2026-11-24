import { signShopifyBody } from '../../../lib/hmac.js';
import type { DomainShopifyOrder } from '../../../modules/sync/types.js';

export type FixtureName =
  | 'paid'
  | 'unpaid'
  | 'cancelled'
  | 'test_payment'
  | 'refunded'
  | 'partially_refunded'
  | 'wrong_currency'
  | 'amount_mismatch'
  | 'cod'
  | 'already_fulfilled'
  | 'split_payment';

const BASE_TIME = '2026-11-20T10:00:00.000Z';

/** A synthetic, standard paid PKR order. No real customer data. */
export function baseOrder(id: string, overrides: Partial<DomainShopifyOrder> = {}): DomainShopifyOrder {
  return {
    shopifyOrderId: id,
    orderNumber: `#${1000 + (Number(id.replace(/\D/g, '')) % 9000)}`,
    financialStatus: 'PAID',
    cancelledAt: null,
    currency: 'PKR',
    subtotalAmount: '4500.00',
    shippingAmount: '250.00',
    totalAmount: '4750.00',
    transactions: [
      {
        id: `${id}-t1`,
        kind: 'SALE',
        status: 'SUCCESS',
        test: false,
        amount: '4750.00',
        currency: 'PKR',
        processedAt: BASE_TIME,
        gateway: 'manual-bank-transfer',
      },
    ],
    refunds: [],
    fulfillments: [],
    paymentGatewayNames: ['manual-bank-transfer'],
    customer: { name: 'Demo Customer', email: 'demo.customer@example.com', phone: '+920000000000' },
    shippingAddress: { address1: '1 Demo Street', city: 'Karachi', country: 'PK' },
    lineItems: [
      {
        shopifyLineItemId: `${id}-l1`,
        productId: 'p1',
        variantId: 'v1',
        productTitle: 'Ceramic Wall Plate',
        variantTitle: 'Blue',
        sku: 'CWP-BLU',
        quantity: 2,
        unitPrice: '2250.00',
        lineTotal: '4500.00',
      },
    ],
    updatedAt: BASE_TIME,
    ...overrides,
  };
}

const SCENARIOS: Record<FixtureName, (id: string) => DomainShopifyOrder> = {
  paid: (id) => baseOrder(id),
  unpaid: (id) => baseOrder(id, { financialStatus: 'PENDING', transactions: [] }),
  cancelled: (id) => baseOrder(id, { cancelledAt: '2026-11-20T11:00:00.000Z' }),
  test_payment: (id) => baseOrder(id, { transactions: [{ ...baseOrder(id).transactions[0]!, test: true }] }),
  refunded: (id) => baseOrder(id, { financialStatus: 'REFUNDED', refunds: [{ id: `${id}-r1` }] }),
  partially_refunded: (id) => baseOrder(id, { financialStatus: 'PARTIALLY_REFUNDED', refunds: [{ id: `${id}-r1` }] }),
  wrong_currency: (id) => baseOrder(id, { currency: 'USD', transactions: [{ ...baseOrder(id).transactions[0]!, currency: 'USD' }] }),
  amount_mismatch: (id) => baseOrder(id, { transactions: [{ ...baseOrder(id).transactions[0]!, amount: '4749.99' }] }),
  cod: (id) => baseOrder(id, { paymentGatewayNames: ['Cash on Delivery (COD)'] }),
  already_fulfilled: (id) => baseOrder(id, { fulfillments: [{ id: `${id}-f1`, status: 'SUCCESS', trackingNumber: 'EXT-123456' }] }),
  split_payment: (id) =>
    baseOrder(id, {
      transactions: [
        {
          id: `${id}-t1`,
          kind: 'SALE',
          status: 'SUCCESS',
          test: false,
          amount: '2000.00',
          currency: 'PKR',
          processedAt: '2026-11-20T09:00:00.000Z',
          gateway: 'manual-bank-transfer',
        },
        {
          id: `${id}-t2`,
          kind: 'SALE',
          status: 'SUCCESS',
          test: false,
          amount: '2750.00',
          currency: 'PKR',
          processedAt: '2026-11-20T09:30:00.000Z',
          gateway: 'manual-bank-transfer',
        },
      ],
    }),
};

export function fixtureOrder(name: FixtureName, id: string): DomainShopifyOrder {
  const build = SCENARIOS[name];
  if (!build) throw new Error(`unknown fixture: ${name}`);
  return build(id);
}

export const FIXTURE_NAMES = Object.keys(SCENARIOS) as FixtureName[];

export interface SignedWebhook {
  body: string;
  headers: Record<string, string>;
}

/** Build a signed webhook exactly as the receiver expects it (used by tests and `npm run webhook:simulate`). */
export function buildSignedWebhook(opts: {
  topic: string;
  shopifyOrderId: string;
  secret: string;
  shopDomain: string;
  webhookId: string;
  body?: Record<string, unknown>;
}): SignedWebhook {
  const payload = opts.body ?? (opts.topic.startsWith('orders/') ? { id: opts.shopifyOrderId } : { order_id: opts.shopifyOrderId });
  const body = JSON.stringify(payload);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-shopify-topic': opts.topic,
      'x-shopify-shop-domain': opts.shopDomain,
      'x-shopify-webhook-id': opts.webhookId,
      'x-shopify-api-version': '2025-01',
      'x-shopify-triggered-at': new Date().toISOString(),
      'x-shopify-hmac-sha256': signShopifyBody(body, opts.secret),
    },
  };
}
